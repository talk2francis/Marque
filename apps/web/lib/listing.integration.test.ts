import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { db, raw, closeDb } from '@marque/db'
import { network } from '@marque/commerce'

const { owners, metadata } = vi.hoisted(() => ({ owners: new Map<string, string>(), metadata: new Map<string, string>() }))
// Exercise owner GET's computation on every call, rather than letting a cached
// response hide its former mutation branch. SQL still uses real fixture Postgres.
vi.mock('@marque/db', async original => ({ ...await original<object>(), cachedProjection: async (_key: string, build: () => Promise<unknown>) => ({ value: await build(), computedAt: new Date().toISOString(), ageMs: 0, stale: false }) }))
vi.mock('@marque/commerce', async original => ({ ...await original<object>(), chainClient: () => ({ readContract: async ({ functionName, args }: { functionName: string; args: bigint[] }) => functionName === 'ownerOf' ? owners.get(String(args[0])) : metadata.get(String(args[0])) }) }))
vi.mock('./limits', () => ({ checkClaimBurst: () => ({ ok: true }), clientKey: () => 'fixture' }))
// Run only with a new, explicitly named fixture DB; never point this at an app DB.
const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const owner = privateKeyToAccount(`0x${'1'.repeat(64)}`)
let serial = 910_000_000_000 + Date.now() % 1_000_000
const rows = (v: unknown) => v as Array<Record<string, unknown>>
describe.skipIf(!enabled)('listing boundary with real PostgreSQL', () => {
  beforeAll(() => { process.env['DATABASE_URL'] = url; process.env['MARQUE_CLAIM_SECRET'] = 'synthetic-fixture-only-p01a' })
  afterAll(async () => { await closeDb() })
  async function fixture(chainId: 56 | 97 = 56, indexed = true, actor = owner) {
    const tokenId = String(++serial)
    const registry = network(chainId).identityRegistry
    const agentId = `${chainId}:${registry.toLowerCase()}:${tokenId}`
    owners.set(tokenId, actor.address)
    metadata.set(tokenId, 'data:application/json,' + encodeURIComponent(JSON.stringify({ name: 'fixture', services: [{ name: 'a2a', endpoint: 'https://example.org/a2a' }] })))
    if (indexed) await db().execute(sql`insert into agent (id, chain_id, token_id, contract_address, owner_address, agent_wallet, name) values (${agentId}, ${chainId}, ${tokenId}, ${registry}, ${actor.address.toLowerCase()}, ${actor.address.toLowerCase()}, 'synthetic listing fixture')`)
    const c = await import('./claim')
    const nonce = c.issueNonce(tokenId, registry, actor.address, chainId)
    const message = c.buildClaimMessage({ tokenId, contract: registry, owner: actor.address, chainId, nonce: nonce.nonce, issuedAt: nonce.issuedAt })
    const signature = await actor.signMessage({ message })
    const verified = await c.verifyClaim({ nonceToken: nonce.token, message, signature, agentId })
    if (!verified.ok) throw new Error(verified.detail)
    return { agentId, tokenId, chainId, ownerAddress: actor.address, claimToken: verified.claimToken, category: 'yield', serviceKind: 'a2a', endpoint: 'https://example.org/a2a' }
  }
  async function publish(f: Awaited<ReturnType<typeof fixture>>, changes: Record<string, unknown> = {}) {
    const { POST } = await import('../app/api/v1/builders/claim/publish/route')
    return POST(new Request('https://candidate.invalid/api/v1/builders/claim/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, ...changes }) }))
  }
  it('rejects unauthenticated publication without creating a listing', async () => {
    const f = await fixture()
    expect((await publish(f, { claimToken: 'invalid' })).status).toBe(401)
    expect(rows(await db().execute(sql`select id from builder_listing where agent_id = ${f.agentId}`))).toHaveLength(0)
  })
  it('rejects ownership transferred after proof and leaves both tables unchanged', async () => {
    const f = await fixture()
    owners.set(f.tokenId, '0x2222222222222222222222222222222222222222')
    expect((await publish(f)).status).toBe(409)
    expect(rows(await db().execute(sql`select id from builder_listing where agent_id = ${f.agentId}`))).toHaveLength(0)
    expect(rows(await db().execute(sql`select category from agent_category where agent_id = ${f.agentId}`))).toHaveLength(0)
  })
  it('concurrent retries create one listing and identical replay changes neither row/version nor timestamps', async () => {
    const f = await fixture()
    const responses = await Promise.all([publish(f), publish(f), publish(f)])
    expect(responses.map(r => r.status)).toEqual([200, 200, 200])
    const before = rows(await db().execute(sql`select xmin::text as version, * from builder_listing where agent_id = ${f.agentId}`))
    const category = rows(await db().execute(sql`select xmin::text as version, * from agent_category where agent_id = ${f.agentId}`))
    expect(before).toHaveLength(1)
    expect((await publish(f)).status).toBe(200)
    expect(rows(await db().execute(sql`select xmin::text as version, * from builder_listing where agent_id = ${f.agentId}`))).toEqual(before)
    expect(rows(await db().execute(sql`select xmin::text as version, * from agent_category where agent_id = ${f.agentId}`))).toEqual(category)
  })
  it('honors testnet identity and profile URL instead of hardcoding mainnet', async () => {
    const f = await fixture(97)
    const response = await publish(f)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ profileUrl: '/builders', chainId: 97, listingLevel: 'owner_listed' })
    expect(rows(await db().execute(sql`select chain_id from builder_listing where agent_id = ${f.agentId}`))[0]).toMatchObject({ chain_id: 97 })
  })
  it('preserves authenticated chain-only testnet listing without inventing an indexed registry row', async () => {
    const f = await fixture(97, false)
    const response = await publish(f)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ indexStatus: 'chain_only', profileUrl: '/builders', chainId: 97 })
    expect(rows(await db().execute(sql`select id from agent where id = ${f.agentId}`))).toHaveLength(0)
    expect(rows(await db().execute(sql`select agent_id from agent_category where agent_id = ${f.agentId}`))).toHaveLength(0)
    expect(rows(await db().execute(sql`select chain_id from builder_listing where agent_id = ${f.agentId}`))[0]).toMatchObject({ chain_id: 97 })
  })
  it('a failed but well-formed MCS result can be cited without acquiring a Warrant or quality listing', async () => {
    const f = await fixture()
    const [test] = rows(await db().execute(sql`insert into conformance_result (agent_id, test_id, test_version, tolerance_revision, category, case_id, chain_id, block_number, pass, request_hash, response_hash) values (${f.agentId}, 'MCS-YIELD-1', 'fixture', 1, 'yield', 'synthetic', 56, '1', false, 'synthetic', 'synthetic') returning id`))
    const response = await publish(f, { conformanceResultId: Number(test!['id']) })
    expect(await response.json()).toMatchObject({ published: true, listingLevel: 'owner_listed' })
    const { builderView } = await import('./builder')
    const view = await builderView(owner.address, 56, f.tokenId)
    expect(view.listingEvidence).toMatchObject({ ownerListed: true, qualityListed: false, warrant: 'separate_service_test', officialCampaign: 'not_determined' })
    expect(view.verdict.checks.find(c => c.id === 'tested')).toMatchObject({ state: 'pass' })
    expect(view.verdict.checks.find(c => c.id === 'tested')!.reason).toContain('did not pass every field')
  })
  it('repeated checks and owner GETs cannot mutate an already published listing', async () => {
    // Token fits the existing public lookup format. Store an owner-authorized listing first.
    const f = await fixture()
    expect((await publish(f)).status).toBe(200)
    const before = rows(await db().execute(sql`select xmin::text as version, * from builder_listing where agent_id = ${f.agentId}`))
    const { GET: checks } = await import('../app/api/v1/builders/checks/route')
    const { GET: ownerGet } = await import('../app/api/v1/phase2/owner/[address]/route')
    for (let i = 0; i < 2; i++) {
      // Read all identities, without invoking the single-token 12-digit UI parser.
      expect((await checks(new NextRequest(`https://candidate.invalid/api/v1/builders/checks?wallet=${owner.address}`))).status).toBe(200)
      expect((await ownerGet(new Request('https://candidate.invalid'), { params: Promise.resolve({ address: owner.address }) })).status).toBe(200)
    }
    expect(rows(await db().execute(sql`select xmin::text as version, * from builder_listing where agent_id = ${f.agentId}`))).toEqual(before)
  })
  it('five local checks cannot qualify a different published endpoint; failed MCS still means tested, not Warranted', async () => {
    const f = await fixture()
    await db().execute(sql`insert into builder_check (agent_key,kind,chain_id,token_id,endpoint,ok,result) values (${f.agentId},'probe',56,${f.tokenId},${f.endpoint},true,'{}'::jsonb), (${f.agentId},'declare',56,${f.tokenId},null,true,'{"category":"yield"}'::jsonb)`)
    await db().execute(sql`insert into conformance_result (agent_id,test_id,test_version,tolerance_revision,category,case_id,chain_id,block_number,pass,request_hash,response_hash) values (${f.agentId},'MCS-YIELD-1','fixture',1,'yield','synthetic',56,'1',false,'synthetic','synthetic')`)
    expect((await publish(f, { endpoint: 'https://different.example/a2a' })).status).toBe(200)
    const { builderView } = await import('./builder')
    const mismatch = await builderView(owner.address, 56, f.tokenId)
    expect(mismatch.verdict.qualityListing).toBe(true)
    expect(mismatch.listingEvidence).toMatchObject({ ownerListed: true, qualityListed: false })
    expect((await publish(f)).status).toBe(200)
    const matches = await builderView(owner.address, 56, f.tokenId)
    expect(matches.listingEvidence).toMatchObject({ qualityListed: true, warrant: 'separate_service_test' })
  })
  it('concurrent proof verification retries append one proof and publication preserves it', async () => {
    const f = await fixture()
    const { readClaimToken } = await import('./claim')
    const claim = readClaimToken(f.claimToken)!
    const { recordProof } = await import('./builder')
    const p = { chainId: f.chainId, tokenId: f.tokenId, owner: claim.owner, message: claim.proofMessage, signature: claim.proofSignature, nonce: claim.proofNonce }
    await Promise.all([recordProof(p), recordProof(p), recordProof(p)])
    expect((await publish(f)).status).toBe(200)
    expect(rows(await db().execute(sql`select id from builder_proof where agent_key = ${f.agentId}`))).toHaveLength(1)
  })
  it('a blocked category write rolls back the listing and proof together', async () => {
    const f = await fixture()
    let unlock: () => void = () => {}
    let signalLocked: () => void = () => {}
    const locked = new Promise<void>(resolve => { signalLocked = resolve })
    const held = raw().begin(async tx => {
      await tx`lock agent_category in access exclusive mode`
      signalLocked()
      await new Promise<void>(resolve => { unlock = resolve })
    })
    await locked
    try { expect((await publish(f)).status).toBe(503) } finally { unlock(); await held }
    expect(rows(await db().execute(sql`select id from builder_listing where agent_id = ${f.agentId}`))).toHaveLength(0)
    expect(rows(await db().execute(sql`select id from builder_proof where agent_key = ${f.agentId}`))).toHaveLength(0)
  })
  it.each(['checks', 'owner'])('fully qualified but unpublished identity remains unpublished after repeated %s GET', async endpoint => {
    // Fresh synthetic actor keeps this case inside owner GET's bounded identity set.
    const f = await fixture(56, true, privateKeyToAccount(generatePrivateKey()))
    const { readClaimToken } = await import('./claim')
    const claim = readClaimToken(f.claimToken)!
    const { recordProof, builderView } = await import('./builder')
    await recordProof({ chainId: 56, tokenId: f.tokenId, owner: claim.owner, message: claim.proofMessage, signature: claim.proofSignature, nonce: claim.proofNonce })
    await db().execute(sql`insert into builder_check (agent_key,kind,chain_id,token_id,endpoint,ok,result) values (${f.agentId},'probe',56,${f.tokenId},${f.endpoint},true,'{}'::jsonb), (${f.agentId},'declare',56,${f.tokenId},null,true,'{"category":"yield"}'::jsonb)`)
    await db().execute(sql`insert into conformance_result (agent_id,test_id,test_version,tolerance_revision,category,case_id,chain_id,block_number,pass,request_hash,response_hash) values (${f.agentId},'MCS-YIELD-1','fixture',1,'yield','synthetic',56,'1',false,'synthetic','synthetic')`)
    const before = await builderView(f.ownerAddress, 56, f.tokenId)
    expect(before.verdict.qualityListing).toBe(true)
    expect(before.listed).toBe(false)
    const { GET: checks } = await import('../app/api/v1/builders/checks/route')
    const { GET: ownerGet } = await import('../app/api/v1/phase2/owner/[address]/route')
    for (let n = 0; n < 2; n++) {
      const response = endpoint === 'checks'
        ? await checks(new NextRequest(`https://candidate.invalid/api/v1/builders/checks?wallet=${f.ownerAddress}&chainId=56&tokenId=${f.tokenId}`))
        : await ownerGet(new Request('https://candidate.invalid'), { params: Promise.resolve({ address: f.ownerAddress }) })
      expect(response.status).toBe(200)
      const payload = await response.json()
      if (endpoint === 'checks') expect(payload.identities[0]).toMatchObject({ listed: false, verdict: { qualityListing: true } })
      else expect(payload.agents).toContainEqual(expect.objectContaining({ agentKey: f.agentId, listedOnMarque: false, qualityListing: true }))
    }
    expect(rows(await db().execute(sql`select id from builder_listing where agent_id = ${f.agentId}`))).toHaveLength(0)
    expect((await builderView(f.ownerAddress, 56, f.tokenId)).listed).toBe(false)
  })
})
