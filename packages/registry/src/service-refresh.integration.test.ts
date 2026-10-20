import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { syncDeclaredServices } from './service-refresh'
import { sellerCandidates } from '../../commerce/src/supply'
const url = process.env.MARQUE_INTEGRATION_DB
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const tokenId = String(Date.now()) + '63'
const agentId = `56:registry-service-fixture:${tokenId}`
const owner = '0x1111111111111111111111111111111111111111'
const rows = (r: unknown) => r as Array<Record<string, unknown>>
let serviceId: number
let probeId: number
const endpoint = 'https://example.org/old/a2a'
const current = 'https://example.org//.well-known/agent-card.json'
const web = 'https://example.org/defi'
const sync = (blockNumber: string, services: unknown[]) => syncDeclaredServices({agentId,chainId:56,tokenId,blockNumber,metadata:{services}})
describe.skipIf(!enabled)('current registry service reconciliation in guarded PostgreSQL', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    await db().execute(sql`insert into agent (id,chain_id,token_id,contract_address,owner_address,agent_wallet,name) values (${agentId},56,${tokenId},${owner},${owner},${owner},'Synthetic service refresh')`)
    const [s] = rows(await db().execute(sql`insert into agent_service (agent_id,kind,endpoint,source) values (${agentId},'a2a',${endpoint},'top_level') returning id`)); serviceId=Number(s!.id)
    const [p] = rows(await db().execute(sql`insert into probe (agent_id,service_id,ok,liveness,latency_ms,manifest) values (${agentId},${serviceId},true,'live',1,'{"skills":[{"id":"negotiate"}]}') returning id`));probeId=Number(p!.id)
    await db().execute(sql`insert into probe_schedule (service_id,agent_id,last_probe_id,last_liveness,next_due_at) values (${serviceId},${agentId},${probeId},'live',now())`)
    await db().execute(sql`insert into agent_category (agent_id,category,confidence,method) values (${agentId},'yield',1,'keyword')`)
  })
  afterAll(async () => { await closeDb() })
  it('indexes all current kinds and retires old bindings without editing observations', async () => {
    const before = rows(await db().execute(sql`select xmin::text as version,* from probe where id = ${probeId}`))
    expect((await sellerCandidates({agentId})).some(s=>s.serviceId===serviceId)).toBe(true)
    expect(await sync('100',[{name:'A2A',endpoint:current},{name:'MCP',endpoint:'https://example.org/mcp'},{name:'x402',endpoint:'https://example.org/pay'},{name:'web',endpoint:web}])).toBe(4)
    const services = rows(await db().execute(sql`select kind,endpoint,currently_declared from agent_service where agent_id = ${agentId}`))
    expect(services).toHaveLength(5)
    expect(services.find(s=>s.endpoint===endpoint)?.currently_declared).toBe(false)
    expect(services.find(s=>s.kind==='web')).toMatchObject({endpoint:web,currently_declared:true})
    expect(rows(await db().execute(sql`select xmin::text as version,* from probe where id = ${probeId}`))).toEqual(before)
    expect(await sellerCandidates({agentId})).toEqual([])
  })
  it('is idempotent and a stale block cannot restore a removed declaration', async () => {
    const before=rows(await db().execute(sql`select id,endpoint from agent_service where agent_id = ${agentId} order by id`))
    expect(await sync('99',[{name:'a2a',endpoint}])).toBe(0)
    expect(rows(await db().execute(sql`select id,endpoint from agent_service where agent_id = ${agentId} order by id`))).toEqual(before)
    await sync('101',[{name:'a2a',endpoint:current},{name:'web',endpoint:web}])
    expect(rows(await db().execute(sql`select id,endpoint from agent_service where agent_id = ${agentId} order by id`))).toEqual(before)
  })
  it('a successful empty declaration retires derived membership but retains every service and probe', async () => {
    await sync('102',[])
    expect(rows(await db().execute(sql`select id from agent_service where agent_id=${agentId}`))).toHaveLength(5)
    expect(rows(await db().execute(sql`select id from agent_service where agent_id=${agentId} and currently_declared=true`))).toHaveLength(0)
    expect(rows(await db().execute(sql`select id from probe where id=${probeId}`))).toHaveLength(1)
  })
})
