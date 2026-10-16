import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const { execute, transaction } = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: () => ({ execute, transaction }) }))
import { sellerCandidates, commercialStates } from './supply'
const agentId = '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:363619'
const dialect = new PgDialect()
beforeEach(() => {
  execute.mockReset().mockResolvedValue([])
  transaction.mockReset().mockImplementation(async fn => fn({ execute }))
})
describe('exact-seller read budget', () => {
  it('restricts candidate probe and category work to the selected identity and service', async () => {
    await sellerCandidates({ agentId, serviceId: 43279 })
    const queries = execute.mock.calls.map(([q]) => dialect.sqlToQuery(q))
    const query = queries.find(q => q.sql.includes('with lp'))!
    expect(query.params.filter(p => p === agentId)).toHaveLength(2)
    expect(query.params).toContain(43279)
    expect(query.sql).toMatch(/where ps.agent_id =/)
    expect(query.sql).toMatch(/from agent_category\s+where agent_id =/)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(queries.some(q => q.sql.includes('statement_timeout'))).toBe(true)
    expect(queries.some(q => q.sql.includes('read only'))).toBe(true)
  })
  it('restricts stored quotes to the selected service and avoids unrelated settlement reads', async () => {
    await commercialStates(43279)
    const queries = execute.mock.calls.map(([q]) => dialect.sqlToQuery(q))
    const quotes = queries.find(q => q.sql.includes('from commerce_quote'))!
    expect(quotes.params).toContain(43279)
    expect(quotes.sql).toMatch(/service_id =/)
    expect(queries.some(q => q.sql.includes('from commerce_job'))).toBe(false)
  })
})

it('keeps the global discovery path separate from exact-agent transaction budgets', async () => {
  await sellerCandidates()
  expect(transaction).not.toHaveBeenCalled()
  const query = dialect.sqlToQuery(execute.mock.calls[0]![0])
  expect(query.sql).not.toContain('where ps.agent_id =')
  expect(query.sql).not.toContain('from agent_category\n      where agent_id =')
})

describe('stored quote truth', () => {
  it.each([
    { signed: false, quote_expires_at: new Date(Date.now() - 1) },
    { signed: false, quote_expires_at: new Date(Date.now() + 60_000), provider_expiry: Math.floor(Date.now() / 1000) - 1 },
    { signed: null, quote_expires_at: new Date(Date.now() + 60_000) },
  ])('does not advertise expired, renewed or unknown-signature prices as hireable', async extra => {
    execute.mockImplementation(async q => dialect.sqlToQuery(q).sql.includes('from commerce_quote') ? [{ service_id: 43279, agent_id: agentId, created_at: new Date(), ok: true, ...extra }] : [])
    const state = (await commercialStates(43279)).get(43279)!
    expect(['hireable', 'settleable']).not.toContain(state.state)
    if (extra.signed === null) expect(state.signatureEvidence).toBe('unknown')
  })
  it.each([true, false])('preserves actual signature mode %s for an unexpired quote', async signed => {
    execute.mockImplementation(async q => dialect.sqlToQuery(q).sql.includes('from commerce_quote') ? [{ service_id: 43279, agent_id: agentId, created_at: new Date(), ok: true, signed, quote_expires_at: new Date(Date.now() + 60_000) }] : [])
    const state = (await commercialStates(43279)).get(43279)!
    expect(state.state).toBe('hireable')
    expect(state.signed).toBe(signed)
    expect(state.signatureEvidence).toBe(signed ? 'provider_signed' : 'identity_matched_unsigned')
  })
})
