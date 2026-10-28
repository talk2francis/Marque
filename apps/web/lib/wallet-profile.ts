import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getAddress, isAddress, recoverMessageAddress, type Address } from 'viem'
import { db } from '@marque/db'
import { chainClient, isSupportedChain, network } from '@marque/commerce'
import { serverToken } from './claim'
import { inspectImage, type ImageFacts } from './image-check'
import { agentPortraits } from './agent-portraits'
import { addressAccent, ACCENTS, avatarSchema, defaultProfile, imageUrlOf, prefsSchema, type Accent, type ProfileInput, type WalletProfile } from './profile-model'

/**
 * Profiles (28 Oct), server side. The owner signs one plain message (no transaction, no gas) and receives a session
 * token valid for seven days; every write checks it. Each saved profile keeps the message and signature that last
 * authorised it, so control is re-checkable by anyone, as with builder listings.
 */

const CHALLENGE_TTL_MS = 10 * 60_000
export const SESSION_TTL_MS = 7 * 24 * 3600_000
const DOMAIN = (() => { try { return new URL(process.env['MARQUE_PUBLIC_URL'] ?? 'https://marque.trade').host } catch { return 'marque.trade' } })()

const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>

/** The tables arrive with migration 0028; until it runs, profiles answer "not available yet" and nothing breaks. */
export class ProfileUnavailable extends Error {}
const missingTable = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code === '42P01' || (err as { cause?: { code?: string } })?.cause?.code === '42P01'
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try { return await run() } catch (err) {
    if (missingTable(err)) throw new ProfileUnavailable('Profiles are being switched on. Try again shortly.')
    throw err
  }
}

/* ------------------------------------------------------------------ sign in */

export function profileMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    `${DOMAIN} wants you to sign in to edit your Marque profile.`,
    '',
    `Address: ${getAddress(address)}`,
    'Purpose: edit the name, portrait and preferences shown for this address on Marque. No transaction, no gas, no approval.',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}

export function issueChallenge(address: string): { message: string; token: string } {
  if (!isAddress(address)) throw new Error('Not an address.')
  const nonce = randomBytes(12).toString('hex')
  const iat = Date.now()
  const message = profileMessage(address, nonce, new Date(iat).toISOString())
  return { message, token: serverToken.sign({ k: 'profile-challenge', address: address.toLowerCase(), nonce, iat }) }
}

export async function signIn(args: { token: string; message: string; signature: string }): Promise<{ ok: true; session: string; address: Address; expiresAt: string } | { ok: false; detail: string }> {
  const c = serverToken.verify(args.token)
  if (!c || c['k'] !== 'profile-challenge') return { ok: false, detail: 'The sign-in request is malformed. Start again.' }
  if (!serverToken.fresh(c['iat'], CHALLENGE_TTL_MS)) return { ok: false, detail: 'The sign-in request expired. Start again.' }
  const address = String(c['address'])
  if (args.message !== profileMessage(address, String(c['nonce']), new Date(Number(c['iat'])).toISOString())) return { ok: false, detail: 'Sign the exact message Marque issued.' }
  let signer: Address
  try { signer = await recoverMessageAddress({ message: args.message, signature: args.signature as `0x${string}` }) } catch { return { ok: false, detail: 'That signature could not be read.' } }
  if (signer.toLowerCase() !== address) return { ok: false, detail: `The signature is from ${signer}, not ${getAddress(address)}.` }
  const iat = Date.now()
  const session = serverToken.sign({ k: 'profile-session', address, message: args.message, signature: args.signature, iat })
  return { ok: true, session, address: getAddress(address), expiresAt: new Date(iat + SESSION_TTL_MS).toISOString() }
}

export interface ProfileSession { address: string; message: string; signature: string }
export function readSession(header: string | null): ProfileSession | null {
  const token = header?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const s = serverToken.verify(token)
  if (!s || s['k'] !== 'profile-session' || !serverToken.fresh(s['iat'], SESSION_TTL_MS)) return null
  const address = String(s['address'] ?? '')
  if (!isAddress(address)) return null
  return { address: address.toLowerCase(), message: String(s['message'] ?? ''), signature: String(s['signature'] ?? '') }
}

/* ------------------------------------------------------------------ images */

export async function storeImage(owner: string, dataUrl: string): Promise<{ ok: true; id: string; url: string; facts: ImageFacts } | { ok: false; detail: string }> {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return { ok: false, detail: 'Send the image as a PNG, JPEG or WebP data URL.' }
  const bytes = new Uint8Array(Buffer.from(m[2]!, 'base64'))
  const check = inspectImage(bytes)
  if (!check.ok) return check
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
  await guarded(() => db().execute(sql`insert into profile_image (id, owner, mime, width, height, bytes)
    values (${id}, ${owner.toLowerCase()}, ${check.facts.mime}, ${check.facts.width}, ${check.facts.height}, ${Buffer.from(bytes)})
    on conflict (id) do nothing`))
  return { ok: true, id, url: imageUrlOf(id), facts: check.facts }
}

export async function readImage(id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null
  const r = rows(await guarded(() => db().execute(sql`select mime, bytes from profile_image where id = ${id} limit 1`)))[0]
  if (!r) return null
  const b = r['bytes']
  return { mime: String(r['mime']), bytes: Buffer.isBuffer(b) ? b : Buffer.from(b as Uint8Array) }
}

async function imageOwnedBy(id: string, owner: string): Promise<boolean> {
  const r = rows(await guarded(() => db().execute(sql`select 1 from profile_image where id = ${id} and owner = ${owner} limit 1`)))
  return r.length > 0
}

/* ------------------------------------------------------------------ agents */

const ownerAbi = [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] }] as const

/** Re-read on chain: the address must own the identity now, not when it was indexed. */
export async function ownsAgent(address: string, agentId: string): Promise<boolean> {
  const [c, contract, token] = agentId.split(':')
  const chainId = Number(c)
  if (!isSupportedChain(chainId) || !contract || !isAddress(contract) || !/^\d{1,78}$/.test(token ?? '')) return false
  // Only identities on the network's ERC-8004 registry: any other contract could answer ownerOf however it liked.
  if (contract.toLowerCase() !== network(chainId).identityRegistry.toLowerCase()) return false
  try {
    const owner = await chainClient(chainId).readContract({ address: getAddress(contract), abi: ownerAbi, functionName: 'ownerOf', args: [BigInt(token!)] })
    return String(owner).toLowerCase() === address.toLowerCase()
  } catch { return false }
}

export async function setAgentPortrait(session: ProfileSession, agentId: string, imageId: string | null): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  if (!(await ownsAgent(session.address, agentId))) return { ok: false, status: 403, detail: 'This wallet does not own that identity on chain.' }
  if (imageId === null) {
    await guarded(() => db().execute(sql`delete from agent_portrait where agent_id = ${agentId}`))
    return { ok: true }
  }
  if (!(await imageOwnedBy(imageId, session.address))) return { ok: false, status: 404, detail: 'Upload the image from this wallet first.' }
  await guarded(() => db().execute(sql`insert into agent_portrait (agent_id, image_id, owner, proof_message, proof_signature)
    values (${agentId}, ${imageId}, ${session.address}, ${session.message}, ${session.signature})
    on conflict (agent_id) do update set image_id = excluded.image_id, owner = excluded.owner,
      proof_message = excluded.proof_message, proof_signature = excluded.proof_signature, set_at = now()`))
  return { ok: true }
}

/* ------------------------------------------------------------------ profiles */

async function agentImage(agentId: string): Promise<string | null> {
  const portrait = (await agentPortraits([agentId])).get(agentId)
  if (portrait) return portrait
  const r = rows(await db().execute(sql`select image_url, raw_metadata #>> '{offchain_content,image}' as meta from agent where id = ${agentId} limit 1`))[0]
  const { registryImageUrl } = await import('./avatar-source')
  return registryImageUrl(r?.['image_url']) ?? registryImageUrl(r?.['meta']) ?? null
}

/** The profile for an address. Prefs only for its owner; a private profile reads as the defaults to anyone else. */
export async function readWalletProfile(address: string, viewer: string | null): Promise<WalletProfile> {
  const a = address.toLowerCase()
  const base = defaultProfile(a)
  let r: Record<string, unknown> | undefined
  try {
    r = rows(await db().execute(sql`select display_name, bio, avatar, accent, prefs, public, updated_at from wallet_profile where address = ${a} limit 1`))[0]
  } catch (err) {
    if (missingTable(err)) return base
    throw err
  }
  if (!r) return base
  const own = viewer === a
  if (!own && r['public'] !== true) return base
  const avatar = avatarSchema.safeParse(r['avatar'])
  const choice = avatar.success ? avatar.data : base.avatar
  const avatarUrl = choice.kind === 'upload' ? imageUrlOf(choice.image) : choice.kind === 'agent' ? await agentImage(choice.agentId).catch(() => null) : null
  const accent = (ACCENTS as readonly string[]).includes(String(r['accent'])) ? (r['accent'] as Accent) : addressAccent(a)
  const prefs = prefsSchema.safeParse(r['prefs'] ?? {})
  return {
    address: a, saved: true,
    displayName: (r['display_name'] as string | null) || null, bio: (r['bio'] as string | null) || null,
    avatar: choice, avatarUrl, accent, public: r['public'] === true,
    prefs: own ? (prefs.success ? prefs.data : prefsSchema.parse({})) : null,
    updatedAt: r['updated_at'] ? new Date(String(r['updated_at'])).toISOString() : null,
  }
}

export async function saveWalletProfile(session: ProfileSession, input: ProfileInput): Promise<{ ok: true; profile: WalletProfile } | { ok: false; status: number; detail: string }> {
  if (input.avatar.kind === 'upload' && !(await imageOwnedBy(input.avatar.image, session.address))) return { ok: false, status: 404, detail: 'Upload the image from this wallet first.' }
  if (input.avatar.kind === 'agent' && !(await ownsAgent(session.address, input.avatar.agentId))) return { ok: false, status: 403, detail: 'That agent is not owned by this wallet on chain.' }
  await guarded(() => db().execute(sql`insert into wallet_profile (address, display_name, bio, avatar, accent, prefs, public, proof_message, proof_signature)
    values (${session.address}, ${input.displayName || null}, ${input.bio || null}, ${JSON.stringify(input.avatar)}::jsonb, ${input.accent},
      ${JSON.stringify(input.prefs)}::jsonb, ${input.public}, ${session.message}, ${session.signature})
    on conflict (address) do update set display_name = excluded.display_name, bio = excluded.bio, avatar = excluded.avatar,
      accent = excluded.accent, prefs = excluded.prefs, public = excluded.public, proof_message = excluded.proof_message,
      proof_signature = excluded.proof_signature, updated_at = now()`))
  return { ok: true, profile: await readWalletProfile(session.address, session.address) }
}

/** Deletes the profile and every image this wallet uploaded that no agent portrait still uses. */
export async function deleteWalletProfile(session: ProfileSession): Promise<void> {
  await guarded(() => db().execute(sql`delete from wallet_profile where address = ${session.address}`))
  await guarded(() => db().execute(sql`delete from profile_image i where i.owner = ${session.address}
    and not exists (select 1 from agent_portrait p where p.image_id = i.id)`))
}
