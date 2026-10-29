import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { sellerServicesQuery } from './seller-services'

const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const agentId = `56:seller-plan-fixture:${Date.now()}`
const rows = (v: unknown) => v as Array<Record<string, unknown>>
type Plan = { 'Relation Name'?: string; 'Actual Rows'?: number; Plans?: Plan[] }
const relations = (plan: Plan): Plan[] => [plan, ...(plan.Plans ?? []).flatMap(relations)]

describe.skipIf(!enabled)('seller history stays bounded with a large observation record', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    await db().execute(sql`insert into agent (id, chain_id, token_id, contract_address, owner_address)
      values (${agentId}, 56, ${String(Date.now())}, 'fixture', '0x1111111111111111111111111111111111111111')`)
    const [service] = rows(await db().execute(sql`insert into agent_service (agent_id, kind, endpoint, source)
      values (${agentId}, 'a2a', 'https://example.org/seller-plan/a2a', 'top_level') returning id`))
    const id = Number(service!['id'])
    await db().execute(sql`insert into probe (agent_id, service_id, ok, liveness, latency_ms, checked_at)
      select ${agentId}, ${id}, n <= 100, case when n <= 100 then 'live' else 'error' end, 1,
        now() - n * interval '1 second' from generate_series(1, 10000) n`)
    await db().execute(sql`insert into commerce_quote (source, agent_id, service_id, endpoint, ok, chain_id, provider, signed, quote_expires_at, created_at)
      select 'probe', ${agentId}, ${id}, 'https://example.org/seller-plan/a2a', true, 56,
        '0x1111111111111111111111111111111111111111', false, now() + interval '5 minutes',
        now() - n * interval '1 second' from generate_series(1, 1000) n`)
    // Statistics belong to this disposable fixture DB; never analyze an application DB from the test suite.
    await db().execute(sql`analyze probe`)
    await db().execute(sql`analyze commerce_quote`)
  })
  afterAll(async () => { await closeDb() })
  it('reads the latest hundred probes and latest quote through the existing ordered indexes', async () => {
    const services = rows(await db().execute(sellerServicesQuery(agentId)))
    expect(services).toHaveLength(1)
    expect(services[0]!['last_good_at']).not.toBeNull()
    expect(services[0]!['last_bad_at']).toBeNull()
    expect(services[0]!['ok']).toBe(true)
    const [explain] = rows(await db().execute(sql`explain (analyze, format json) ${sellerServicesQuery(agentId)}`))
    const plan = (explain!['QUERY PLAN'] as Array<{ Plan: Plan }>)[0]!.Plan
    const nodes = relations(plan)
    const probes = nodes.filter((n) => n['Relation Name'] === 'probe')
    const quotes = nodes.filter((n) => n['Relation Name'] === 'commerce_quote')
    expect(probes.length).toBeGreaterThan(0)
    expect(quotes.length).toBeGreaterThan(0)
    // Bound database work, rather than relying on a machine-dependent millisecond threshold.
    expect(Math.max(...probes.map((n) => n['Actual Rows'] ?? 0))).toBeLessThanOrEqual(100)
    expect(Math.max(...quotes.map((n) => n['Actual Rows'] ?? 0))).toBeLessThanOrEqual(10)
  })
})
