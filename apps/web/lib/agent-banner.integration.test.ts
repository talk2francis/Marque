import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { readFileSync, writeFileSync } from 'node:fs'
import { db, closeDb } from '@marque/db'
import { network } from '@marque/commerce'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { GET, PUT } from '../app/api/v1/me/banner/route'
import { readAgentBanner, saveAgentBanner } from './agent-banners'
import { deleteWalletProfile, storeImage, issueChallenge, signIn } from './wallet-profile'
const mocked = vi.hoisted(() => ({ owner: '' }))
vi.mock('@marque/commerce', async original => ({ ...await original<object>(), chainClient: () => ({ readContract: async () => mocked.owner }) }))
const url = process.env['MARQUE_INTEGRATION_DB'], enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
// Unfunded throwaway actors exist only inside this isolated test process. Keys are never logged or stored.
const account = privateKeyToAccount(generatePrivateKey()), owner = account.address.toLowerCase(), other = privateKeyToAccount(generatePrivateKey()).address.toLowerCase()
const agentId = `97:${network(97).identityRegistry.toLowerCase()}:${Date.now()}`, second = agentId + '1'
const session = { address: owner, message: 'isolated fixture proof', signature: 'isolated fixture signature' }
const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>
const capturedImage = process.env['BANNER_TEST_IMAGE']
const image = capturedImage ? readFileSync(capturedImage, 'utf8').trim() : (() => { const b = new Uint8Array(64); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); new DataView(b.buffer).setUint32(16, 960); new DataView(b.buffer).setUint32(20, 320); return 'data:image/png;base64,' + Buffer.from(b).toString('base64') })()
const imageBytes = Buffer.from(image.split(',')[1]!, 'base64').length
let firstUrl = ''
describe.skipIf(!enabled)('owner banner persistence on an isolated schema', () => {
  beforeAll(async () => { process.env['DATABASE_URL'] = url; mocked.owner = owner; await db().execute(sql`select 1 from agent_banner limit 0`) })
  afterAll(async () => {
    // Optional browser fixtures remain isolated by the database-name gate above. This flag is never in app code.
    const receipt = process.env['BANNER_RENDER_RECEIPT']
    if (receipt && capturedImage) {
      mocked.owner = owner
      const registry = network(97).identityRegistry, prefix = `97:${registry.toLowerCase()}:9${String(Date.now()).slice(-9)}`, bannerId = prefix + '1', plainId = prefix + '2'
      for (const [id, name] of [[bannerId, 'Banner layout fixture'], [plainId, 'Default layout fixture']]) await db().execute(sql`insert into agent(id,chain_id,token_id,contract_address,owner_address,agent_wallet,name,description) values (${id!},97,${id!.split(':')[2]},${registry},${owner},${owner},${name!},'Isolated browser fixture. No production agent or paid work.')`)
      const saved = await saveAgentBanner(session, bannerId, image)
      if (!saved.ok || !saved.banner) throw new Error('Browser fixture banner was not saved')
      writeFileSync(receipt, JSON.stringify({ bannerId, plainId, owner, banner: saved.banner, bytes: imageBytes, isolated: true }, null, 2) + '\n', { mode: 0o600 })
    }
    await closeDb()
  })
  it('starts with no banner and leaves the default profile available', async () => { expect(await readAgentBanner(agentId)).toBeNull() })
  it('persists image bytes, the owner proof and public presentation separately', async () => {
    const saved = await saveAgentBanner(session, agentId, image); expect(saved.ok).toBe(true)
    if (!saved.ok || !saved.banner) throw new Error('Fixture banner was not saved')
    firstUrl = saved.banner.url
    expect(await readAgentBanner(agentId)).toEqual(saved.banner)
    const row = rows(await db().execute(sql`select b.owner,b.proof_message,b.proof_signature,i.width,i.height,octet_length(i.bytes) as size from agent_banner b join profile_image i on i.id=b.image_id where b.agent_id=${agentId}`))[0]!
    expect(row).toMatchObject({ owner, proof_message: session.message, proof_signature: session.signature, width: 960, height: 320, size: imageBytes })
  })
  it('allows identical art from another owner without granting access to the first identity', async () => {
    mocked.owner = other
    const saved = await saveAgentBanner({ ...session, address: other }, second, image)
    expect(saved.ok && saved.banner?.url).not.toBe(firstUrl)
    const before = await readAgentBanner(agentId)
    expect(await saveAgentBanner(session, agentId, null)).toMatchObject({ ok: false, status: 403 })
    expect(await readAgentBanner(agentId)).toEqual(before)
    mocked.owner = owner
  })
  it('keeps an active banner image when the owner removes their separate wallet profile', async () => {
    await storeImage(owner, image)
    await deleteWalletProfile(session)
    expect((await readAgentBanner(agentId))?.url).toBe(firstUrl)
    expect(rows(await db().execute(sql`select count(*)::int as n from profile_image where owner=${owner}`))[0]?.['n']).toBe(1)
  })
  it('accepts the actual signed-session HTTP flow and refuses a tampered token', async () => {
    const challenge = issueChallenge(owner)
    const signed = await signIn({ token: challenge.token, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) })
    if (!signed.ok) throw new Error('Fixture sign-in failed')
    const make = (token: string) => new Request('https://marque.trade/api/v1/me/banner', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ agentId, dataUrl: image }) })
    const response = await PUT(make(signed.session)); expect(response.status).toBe(200)
    const saved = await response.json(); expect(saved.banner.url).toBe(firstUrl)
    const read = await GET(new Request('https://marque.trade/api/v1/me/banner?agentId=' + encodeURIComponent(agentId)))
    expect(read.status).toBe(200); expect(await read.json()).toEqual(saved)
    expect((await PUT(make('tampered.' + signed.session))).status).toBe(401)
    mocked.owner = other
    expect((await PUT(make(signed.session))).status).toBe(403)
    mocked.owner = owner
  })
  it('clears only the banner pointer and retains its image bytes and presentation proof', async () => {
    expect(await saveAgentBanner(session, agentId, null)).toEqual({ ok: true, banner: null })
    expect(await readAgentBanner(agentId)).toBeNull()
    const row = rows(await db().execute(sql`select image_id,owner,proof_message from agent_banner where agent_id=${agentId}`))[0]!
    expect(row).toMatchObject({ image_id: null, owner, proof_message: session.message })
    expect(rows(await db().execute(sql`select count(*)::int as n from profile_image where owner=${owner}`))[0]?.['n']).toBe(1)
  })
})
