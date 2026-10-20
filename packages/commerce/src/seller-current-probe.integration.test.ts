import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { sellerCandidates } from './supply'

const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const stamp = Date.now()
const cases = [
  { name: 'live', liveness: 'live', category: 'yield', advertises: false, expected: true },
  { name: 'unbound', liveness: 'unbound', category: 'yield', advertises: false, expected: true },
  { name: 'bad-schema', liveness: 'bad_schema', category: 'yield', advertises: false, expected: true },
  { name: 'dead-after-live', liveness: 'dead', category: 'yield', advertises: false, expected: false },
  { name: 'unknown-after-live', liveness: null, category: 'yield', advertises: false, expected: false },
  { name: 'advertised-commerce', liveness: 'dead', category: 'unclassified', advertises: true, expected: true },
  { name: 'notify-funded', liveness: 'dead', category: 'unclassified', advertises: true, expected: true },
  { name: 'commerce-id', liveness: 'dead', category: 'unclassified', advertises: true, expected: true },
  { name: 'commerce-name', liveness: 'dead', category: 'unclassified', advertises: true, expected: true },
  { name: 'description-only', liveness: 'dead', category: 'unclassified', advertises: false, expected: false },
  { name: 'malformed-skills', liveness: 'dead', category: 'unclassified', advertises: false, expected: false },
  { name: 'unclassified', liveness: 'live', category: 'unclassified', advertises: false, expected: false },
  { name: 'missing-current', liveness: 'live', category: 'yield', advertises: false, expected: false },
  { name: 'mixed-labels', liveness: 'live', category: 'yield', advertises: false, expected: true },
  { name: 'future-advertised-category', liveness: 'dead', category: 'zz_custom', advertises: true, expected: true },
] as const
const services = new Map<string, { agentId: string; serviceId: number }>()
const rows = (value: unknown) => Array.from(value as Array<Record<string, unknown>>)

describe.skipIf(!enabled)('seller discovery uses each service current probe in isolated PostgreSQL', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    for (const [i, fixture] of cases.entries()) {
      const agentId = `56:seller-current-probe:${stamp}:${i}`
      await db().execute(sql`insert into agent(id,chain_id,contract_address,token_id,name) values(${agentId},56,'0x0000000000000000000000000000000000000001',${`${stamp}${i}`},${fixture.name})`)
      await db().execute(sql`insert into agent_category(agent_id,category,confidence,method) values(${agentId},${fixture.category},1,'owner_declared')`)
      if (fixture.name === 'mixed-labels') {
        await db().execute(sql`insert into agent_category(agent_id,category,confidence,method) values(${agentId},'unclassified',100,'owner_declared')`)
      }
      const endpoint = `https://fixture.invalid/current-probe/${stamp}/${i}`
      const [service] = rows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values(${agentId},'a2a',${endpoint},'onchain') returning id`))
      const serviceId = Number(service!.id)
      // Older live observations must never make a dead/missing current probe eligible.
      await db().execute(sql`insert into probe(agent_id,service_id,ok,liveness,manifest) values(${agentId},${serviceId},true,'live','{}'::jsonb)`)
      const skills = fixture.name === 'notify-funded' ? [{ id: 'notify_funded' }]
        : fixture.name === 'commerce-id' ? [{ id: 'custom-8183-call' }]
        : fixture.name === 'commerce-name' ? [{ name: 'ERC-8183 commerce' }]
        : fixture.name === 'malformed-skills' ? 'not-an-array'
        : fixture.advertises ? [{ id: 'negotiate' }] : []
      const manifest = { url: endpoint, skills, description: fixture.name === 'description-only' ? 'ERC-8183 seller' : '' }
      const [current] = rows(await db().execute(sql`insert into probe(agent_id,service_id,ok,liveness,manifest) values(${agentId},${serviceId},${fixture.liveness === 'live'},${fixture.liveness},${JSON.stringify(manifest)}::jsonb) returning id`))
      await db().execute(sql`insert into probe_schedule(service_id,agent_id,last_probe_id,next_due_at) values(${serviceId},${agentId},${fixture.name === 'missing-current' ? null : Number(current!.id)},now())`)
      services.set(fixture.name, { agentId, serviceId })
    }
  })
  afterAll(async () => { await closeDb() })

  it.each(cases)('preserves current-probe eligibility for $name', async fixture => {
    const selected = services.get(fixture.name)!
    const scoped = await sellerCandidates(selected)
    expect(scoped.map(row => row.serviceId)).toEqual(fixture.expected ? [selected.serviceId] : [])
    if (fixture.expected) expect(scoped[0]?.category).toBe(fixture.category === 'unclassified' ? null : fixture.category)
  })

  it('returns the same fixture services globally and with exact-service scopes', async () => {
    const fixtureIds = new Set([...services.values()].map(row => row.serviceId))
    const global = (await sellerCandidates()).filter(row => fixtureIds.has(row.serviceId))
    const scoped = (await Promise.all([...services.values()].map(row => sellerCandidates(row)))).flat()
    expect(global.sort((a, b) => a.serviceId - b.serviceId)).toEqual(scoped.sort((a, b) => a.serviceId - b.serviceId))
  })
})
