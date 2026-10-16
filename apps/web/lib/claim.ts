import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getAddress, isAddress, recoverMessageAddress, type Address } from 'viem'
import { chainClient, isSupportedChain, network } from '@marque/commerce'

/**
 * The claim rail's proof-of-control (P10a).
 *
 * A builder proves they hold the key that owns an ERC-8004 identity by signing
 * a fixed message. No transaction, no gas, no approval queue. Two short-lived
 * HMAC tokens carry the flow so the server keeps no session:
 *
 *   nonce  — issued with the identity, embedded in the message to be signed,
 *            bound to (tokenId, contract, owner), valid 10 minutes.
 *   claim  — issued after the signature verifies against ownerOf on chain,
 *            required by /publish, valid 20 minutes.
 *
 * The signature itself is stored on the published listing, so control is
 * re-checkable by anyone later, not just trusted because we said so.
 */

const SECRET = process.env['MARQUE_CLAIM_SECRET'] ?? ''
const NONCE_TTL_MS = 10 * 60_000
const CLAIM_TTL_MS = 20 * 60_000
const DOMAIN = (() => {
  try { return new URL(process.env['MARQUE_PUBLIC_URL'] ?? 'https://marque.trade').host } catch { return 'marque.trade' }
})()

function hmac(parts: string[]): string {
  if (!SECRET) throw new Error('MARQUE_CLAIM_SECRET is not set')
  return createHmac('sha256', SECRET).update(parts.join('\n')).digest('base64url')
}

function sign(payload: Record<string, string | number>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${hmac([body])}`
}

function verify(token: string): Record<string, unknown> | null {
  if (!SECRET) throw new Error('MARQUE_CLAIM_SECRET is not set')
  const [body, mac, extra] = token.split('.')
  if (extra !== undefined) return null
  if (!body || !mac) return null
  const expected = hmac([body])
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

// ── nonce ──────────────────────────────────────────────────────────────────

export function canonicalClaimKey(chainId: number, contract: string, tokenId: string): string | null {
  if (!isSupportedChain(chainId) || !isAddress(contract) || contract.toLowerCase() !== network(chainId).identityRegistry.toLowerCase() || !/^(0|[1-9]\d{0,77})$/.test(tokenId) || BigInt(tokenId) >= 2n ** 256n) return null
  return `${chainId}:${contract.toLowerCase()}:${tokenId}`
}

function fresh(iat: unknown, ttl: number): boolean {
  return typeof iat === 'number' && Number.isSafeInteger(iat) && iat <= Date.now() && Date.now() - iat <= ttl
}

export function issueNonce(tokenId: string, contract: string, owner: string, chainId: number = 56): { nonce: string; token: string; issuedAt: string } {
  if (!canonicalClaimKey(chainId, contract, tokenId) || !isAddress(owner)) throw new Error('Invalid identity for proof request')
  const nonce = randomBytes(12).toString('hex')
  const iat = Date.now()
  const issuedAt = new Date(iat).toISOString()
  const token = sign({ k: 'nonce', nonce, tokenId, contract: contract.toLowerCase(), owner: owner.toLowerCase(), chainId, iat })
  return { nonce, token, issuedAt }
}

// ── the message that gets signed ───────────────────────────────────────────

export interface ClaimMessageParts {
  tokenId: string
  contract: string
  owner: string
  nonce: string
  issuedAt: string
  /** 56 (default) or 97: the network whose identity registry is being proved against. */
  chainId?: number
}

/**
 * A SIWE-shaped message (EIP-4361 fields), trimmed to what this rail needs and
 * with an explicit line that signing authorises nothing on chain.
 */
export function buildClaimMessage(p: ClaimMessageParts): string {
  return [
    `${DOMAIN} wants you to prove control of an ERC-8004 identity.`,
    ``,
    `Identity: #${p.tokenId}`,
    `Contract: ${getAddress(p.contract)}`,
    `Owner: ${getAddress(p.owner)}`,
    `Chain ID: ${p.chainId ?? 56}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
    ``,
    `Signing this authorises no transaction, transfer, approval or spend.`,
    `It only proves you hold the key that owns this identity, so Marque`,
    `can attach your marketplace listing to it.`,
  ].join('\n')
}

// ── verification ───────────────────────────────────────────────────────────

export type VerifyResult =
  | { ok: true; agentId: string; owner: Address; claimToken: string; chainId: number; tokenId: string; nonce: string }
  | { ok: false; detail: string }

export async function verifyClaim(args: {
  nonceToken: string
  message: string
  signature: string
  agentId: string
}): Promise<VerifyResult> {
  const claim = verify(args.nonceToken)
  if (!claim || claim['k'] !== 'nonce') return { ok: false, detail: 'The proof request is malformed. Start again.' }
  if (!fresh(claim['iat'], NONCE_TTL_MS)) {
    return { ok: false, detail: 'The proof request expired. Fetch the identity again and re-sign.' }
  }

  const tokenId = String(claim['tokenId'])
  const contract = String(claim['contract'])
  const nonce = String(claim['nonce'])
  const declaredOwner = String(claim['owner'])
  const chainId = Number(claim['chainId'] ?? 56)
  if (!isSupportedChain(chainId)) return { ok: false, detail: 'The proof request names an unsupported network.' }
  if (canonicalClaimKey(chainId, contract, tokenId) !== args.agentId || !isAddress(declaredOwner)) return { ok: false, detail: 'The proof request and selected identity do not match.' }
  // Older in-flight requests issued the message a few milliseconds after the nonce.
  // Accept that bounded difference, while comparing the entire signed message.
  const issuedAt = /^Issued At: (.+)$/m.exec(args.message)?.[1] ?? ''
  if (!Number.isFinite(Date.parse(issuedAt)) || Math.abs(Date.parse(issuedAt) - Number(claim['iat'])) > 5000 || args.message !== buildClaimMessage({ tokenId, contract, owner: declaredOwner, chainId, nonce, issuedAt })) return { ok: false, detail: 'Sign the exact proof message issued for this identity.' }

  let signer: Address
  try {
    signer = await recoverMessageAddress({ message: args.message, signature: args.signature as `0x${string}` })
  } catch {
    return { ok: false, detail: 'That signature could not be read.' }
  }

  // Re-read the owner from chain at verify time: a transfer between fetching
  // the identity and signing must invalidate the claim, not slip through on
  // the value we cached.
  let onchainOwner: Address
  try {
    const res = await chainClient(chainId).readContract({
      address: getAddress(contract),
      abi: [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] }],
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    })
    onchainOwner = getAddress(res as string)
  } catch (err) {
    return { ok: false, detail: `Could not re-check ownership on chain: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (signer.toLowerCase() !== onchainOwner.toLowerCase() || signer.toLowerCase() !== declaredOwner.toLowerCase()) {
    const drifted = declaredOwner.toLowerCase() !== onchainOwner.toLowerCase()
    return {
      ok: false,
      detail: drifted
        ? `Ownership changed while you were signing. The identity is now owned by ${onchainOwner}.`
        : `The signature is from ${signer}, which does not own identity #${tokenId}. It is owned by ${onchainOwner}.`,
    }
  }

  const claimToken = sign({
    k: 'claim',
    agentId: args.agentId,
    owner: onchainOwner.toLowerCase(),
    tokenId,
    contract,
    chainId,
    nonce,
    message: args.message,
    signature: args.signature,
    iat: Date.now(),
  })
  return { ok: true, agentId: args.agentId, owner: onchainOwner, claimToken, chainId, tokenId, nonce }
}

export interface AuthorisedClaim {
  agentId: string
  owner: Address
  tokenId: string
  contract: Address
  chainId: number
  /** The exact message and signature that proved control, for the stored record. */
  proofMessage: string
  proofSignature: string
  proofNonce: string
}

/** Test seam: the HMAC token primitives, so the round-trip can be checked
 *  without a chain. Not used by the app. */
export const __testonly = { sign, verify }

export function readClaimToken(token: string): AuthorisedClaim | null {
  const claim = verify(token)
  if (!claim || claim['k'] !== 'claim') return null
  if (!fresh(claim['iat'], CLAIM_TTL_MS)) return null
  const owner = String(claim['owner'] ?? '')
  const contract = String(claim['contract'] ?? '')
  if (!isAddress(owner) || !isAddress(contract)) return null
  const chainId = Number(claim['chainId'] ?? 56)
  const tokenId = String(claim['tokenId'] ?? '')
  const agentId = String(claim['agentId'] ?? '')
  if (canonicalClaimKey(chainId, contract, tokenId) !== agentId || !claim['message'] || !claim['nonce'] || !/^0x[0-9a-fA-F]{130}$/.test(String(claim['signature'] ?? ''))) return null
  return {
    agentId,
    owner: getAddress(owner),
    tokenId,
    contract: getAddress(contract),
    chainId,
    proofMessage: String(claim['message'] ?? ''),
    proofSignature: String(claim['signature'] ?? ''),
    proofNonce: String(claim['nonce'] ?? ''),
  }
}

/** Fresh read immediately before an authorized publication; a cached proof is insufficient. */
export async function claimOwnerIsCurrent(claim: AuthorisedClaim): Promise<boolean> {
  if (!isSupportedChain(claim.chainId) || canonicalClaimKey(claim.chainId, claim.contract, claim.tokenId) !== claim.agentId) return false
  const owner = await chainClient(claim.chainId).readContract({
    address: claim.contract,
    abi: [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] }],
    functionName: 'ownerOf', args: [BigInt(claim.tokenId)],
  })
  return String(owner).toLowerCase() === claim.owner.toLowerCase()
}
