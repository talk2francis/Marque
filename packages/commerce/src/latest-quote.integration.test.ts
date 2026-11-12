import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { commercialStates, latestCommerceQuoteQuery, latestQuoteProbeQuery, quoteProbeRecoveryQuery } from './supply'

const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const stamp = Date.now()
const ids = [`56:latest-quote:${stamp}:0`, `56:latest-quote:${stamp}:1`]
const now = Date.now()
const rows = (value: unknown) => Array.from(value as Array<Record<string, unknown>>)
let first = 0, second = 0, unquoted = 0, probeScoped = 0
const orphan = -((stamp % 1_000_000_000) + 1)
const expiry = Math.floor(now / 1000) + 600

describe.skipIf(!enabled)('latest quote payload selection in isolated PostgreSQL', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    for (const [i, id] of ids.entries()) {
      await db().execute(sql`insert into agent(id,chain_id,contract_address,token_id,name) values(${id},56,'0x0000000000000000000000000000000000000001',${`${stamp}${i}`},'latest quote fixture')`)
    }
    for (const [i, agent] of [ids[0]!, ids[1]!, ids[0]!, ids[1]!].entries()) {
      const [service] = rows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values(${agent},'a2a',${`https://fixture.invalid/a2a/${i}`},'onchain') returning id`))
      if (!first) first = Number(service!.id)
      else if (!second) second = Number(service!.id)
      else if (!unquoted) unquoted = Number(service!.id)
      else probeScoped = Number(service!.id)
    }
    const quote = async (agent: string, service: number | null, age: number, ok: boolean, price: string, raw: object, source: 'probe' | 'user' = 'probe') => {
      const endpoint = `https://fixture.invalid/a2a/${service === first ? 0 : 1}`
      await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok,failure,detail,chain_id,provider,price_raw,token,token_symbol,token_decimals,created_at,quote_expires_at,negotiation_hash,provider_sig,signed,raw)
        values(${source},${agent},${service},${endpoint},${ok},${ok ? null : 'fixture_newer_failure'},${ok ? null : 'A newer failed observation must win'},56,'0x0000000000000000000000000000000000000002',${price},'0x0000000000000000000000000000000000000003','FIX',18,${new Date(now - age).toISOString()},${new Date(now + 600_000).toISOString()},'synthetic','0x01',false,${JSON.stringify(raw)}::jsonb)`)
    }
    await quote(ids[0]!, first, 20_000, true, '10000000000000000', { quote_expires_at: expiry, history: 'x'.repeat(32_768) })
    await quote(ids[0]!, first, 1_000, false, '10000000000000000', { quote_expires_at: expiry - 5 })
    await quote(ids[1]!, second, 5_000, true, '10000000000000000', { quote_expires_at: expiry })
    await quote(ids[1]!, second, 5_000, true, '20000000000000000', { quote_expires_at: expiry + 1, response: { quote_expires_at: expiry + 2 } })
    await quote(ids[0]!, orphan, 45 * 86_400_000, true, '30000000000000000', { quote_expires_at: expiry - 86_400 })
    await quote(ids[0]!, 0, 10_000, true, '40000000000000000', { quote_expires_at: expiry })
    await quote(ids[0]!, null, 0, true, '50000000000000000', { quote_expires_at: expiry })
    await quote(ids[1]!, probeScoped, 2_000, false, '60000000000000000', { quote_expires_at: expiry + 3 })
    await quote(ids[1]!, probeScoped, 0, true, '70000000000000000', { quote_expires_at: expiry + 4 }, 'user')
    await quote(ids[0]!, first, 20_000, false, '10000000000000000', { quote_expires_at: expiry })
  })
  afterAll(async () => { await closeDb() })

  it('matches the original latest-row projection for every fixture service', async () => {
    const original = rows(await db().execute(sql`
      select distinct on (service_id) service_id, agent_id, ok, failure, detail, chain_id, provider, price_raw, token,
             token_symbol, token_decimals, created_at, quote_expires_at, negotiation_hash, provider_sig, signed, latency_ms,
             raw->'quote_expires_at' as provider_expiry, raw#>'{response,quote_expires_at}' as response_expiry
      from commerce_quote where service_id is not null
      order by service_id, created_at desc, id desc
    `))
    const selected = rows(await db().execute(latestCommerceQuoteQuery()))
    expect(selected).toEqual(original)
  })
  it('keeps a newer failure rather than reviving an older valid-looking price', async () => {
    const [row] = rows(await db().execute(latestCommerceQuoteQuery(first)))
    expect(row).toMatchObject({ service_id: first, ok: false, failure: 'fixture_newer_failure' })
    const state = (await commercialStates(first)).get(first)
    expect(state?.failure).toBe('fixture_newer_failure')
    expect(['hireable', 'settleable']).not.toContain(state?.state)
  })
  it('retains ID tie-breaking, exact atomic price and both raw expiry observations', async () => {
    const [row] = rows(await db().execute(latestCommerceQuoteQuery(second)))
    expect(row).toMatchObject({ service_id: second, price_raw: '20000000000000000', provider_expiry: expiry + 1, response_expiry: expiry + 2 })
  })
  it('does not substitute another service when the selected service has no quote', async () => {
    expect(rows(await db().execute(latestCommerceQuoteQuery(unquoted)))).toEqual([])
    expect(await commercialStates(unquoted)).toEqual(new Map())
  })
  it('keeps historical orphan and zero service IDs without requiring a declaration join', async () => {
    const selected = rows(await db().execute(latestCommerceQuoteQuery()))
    expect(selected.find(row => row.service_id === orphan)).toMatchObject({ agent_id: ids[0], price_raw: '30000000000000000' })
    expect(selected.find(row => row.service_id === 0)).toMatchObject({ agent_id: ids[0], price_raw: '40000000000000000' })
    expect(selected.filter(row => row.service_id === orphan)).toHaveLength(1)
  })
  it('does not include a newer service-less observation or create duplicate service winners', async () => {
    const selected = rows(await db().execute(latestCommerceQuoteQuery()))
    expect(selected.every(row => row.service_id !== null)).toBe(true)
    expect(new Set(selected.map(row => row.service_id)).size).toBe(selected.length)
    expect(selected.some(row => row.agent_id === ids[0] && row.price_raw === '50000000000000000')).toBe(false)
  })
  it('matches every original latest probe observation, including retained historical and orphan services', async () => {
    const original = rows(await db().execute(sql`select distinct on (service_id) service_id, created_at, ok, signed, quote_expires_at,
      raw->'quote_expires_at' as provider_expiry, raw#>'{response,quote_expires_at}' as response_expiry
      from commerce_quote where source = 'probe' and service_id is not null order by service_id, created_at desc, id desc`))
    expect(rows(await db().execute(latestQuoteProbeQuery()))).toEqual(original)
  })
  it('keeps the latest failed probe ahead of a newer user quote for probe scheduling', async () => {
    const selected = rows(await db().execute(latestQuoteProbeQuery()))
    expect(selected.find(row => Number(row.service_id) === probeScoped)).toMatchObject({ ok: false, provider_expiry: expiry + 3 })
  })
  it('matches the complete original two-day quote recovery evidence', async () => {
    const original = rows(await db().execute(sql`
      with recent as (select service_id, ok, created_at from commerce_quote where source = 'probe' and service_id is not null and created_at > now() - interval '2 days'),
      oks as (select service_id, max(created_at) as last_ok from recent where ok group by service_id)
      select o.service_id, o.last_ok, (select count(*) from recent r where r.service_id = o.service_id and not r.ok and r.created_at > o.last_ok)::int as fails
      from oks o order by o.service_id`))
    expect(rows(await db().execute(quoteProbeRecoveryQuery()))).toEqual(original)
  })
  it('counts failures strictly after the latest successful probe and retains the recovery window', async () => {
    const selected = rows(await db().execute(quoteProbeRecoveryQuery()))
    const row = selected.find(row => Number(row.service_id) === first)!
    expect(row.fails).toBe(1)
    expect(new Date(row.last_ok as string).getTime()).toBe(now - 20_000)
    expect(selected.some(row => Number(row.service_id) === orphan || Number(row.service_id) === probeScoped)).toBe(false)
  })
})
