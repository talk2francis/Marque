import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { commercialStates, latestCommerceQuoteQuery } from './supply'

const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const stamp = Date.now()
const ids = [`56:latest-quote:${stamp}:0`, `56:latest-quote:${stamp}:1`]
const now = Date.now()
const rows = (value: unknown) => Array.from(value as Array<Record<string, unknown>>)
let first = 0, second = 0, unquoted = 0
const expiry = Math.floor(now / 1000) + 600

describe.skipIf(!enabled)('latest quote payload selection in isolated PostgreSQL', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    for (const [i, id] of ids.entries()) {
      await db().execute(sql`insert into agent(id,chain_id,contract_address,token_id,name) values(${id},56,'0x0000000000000000000000000000000000000001',${`${stamp}${i}`},'latest quote fixture')`)
    }
    for (const [i, agent] of [ids[0]!, ids[1]!, ids[0]!].entries()) {
      const [service] = rows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values(${agent},'a2a',${`https://fixture.invalid/a2a/${i}`},'onchain') returning id`))
      if (!first) first = Number(service!.id)
      else if (!second) second = Number(service!.id)
      else unquoted = Number(service!.id)
    }
    const quote = async (agent: string, service: number, age: number, ok: boolean, price: string, raw: object) => {
      const endpoint = `https://fixture.invalid/a2a/${service === first ? 0 : 1}`
      await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok,failure,detail,chain_id,provider,price_raw,token,token_symbol,token_decimals,created_at,quote_expires_at,negotiation_hash,provider_sig,signed,raw)
        values('probe',${agent},${service},${endpoint},${ok},${ok ? null : 'fixture_newer_failure'},${ok ? null : 'A newer failed observation must win'},56,'0x0000000000000000000000000000000000000002',${price},'0x0000000000000000000000000000000000000003','FIX',18,${new Date(now - age).toISOString()},${new Date(now + 600_000).toISOString()},'synthetic','0x01',false,${JSON.stringify(raw)}::jsonb)`)
    }
    await quote(ids[0]!, first, 20_000, true, '10000000000000000', { quote_expires_at: expiry, history: 'x'.repeat(32_768) })
    await quote(ids[0]!, first, 1_000, false, '10000000000000000', { quote_expires_at: expiry - 5 })
    await quote(ids[1]!, second, 5_000, true, '10000000000000000', { quote_expires_at: expiry })
    await quote(ids[1]!, second, 5_000, true, '20000000000000000', { quote_expires_at: expiry + 1, response: { quote_expires_at: expiry + 2 } })
  })
  afterAll(async () => { await closeDb() })

  it('matches the original latest-row projection for every fixture service', async () => {
    const original = rows(await db().execute(sql`
      select distinct on (service_id) service_id, agent_id, ok, failure, detail, chain_id, provider, price_raw, token,
             token_symbol, token_decimals, created_at, quote_expires_at, negotiation_hash, provider_sig, signed, latency_ms,
             raw->'quote_expires_at' as provider_expiry, raw#>'{response,quote_expires_at}' as response_expiry
      from commerce_quote where service_id in (${first}, ${second})
      order by service_id, created_at desc, id desc
    `))
    const selected = rows(await db().execute(latestCommerceQuoteQuery())).filter(row => [first, second].includes(Number(row.service_id)))
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
})
