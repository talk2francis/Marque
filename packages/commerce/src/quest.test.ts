import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: () => ({ execute }) }))
vi.mock('./indexer.js', () => ({ REPUTATION_REGISTRY: {}, LOG_WINDOW: {}, cursorOf: async () => 500, logsClient: vi.fn() }))
vi.mock('./chain.js', () => ({ chainClient: vi.fn() }))
import { walletQuest, teamWallets } from './quest'
import { QUEST_CATEGORIES } from './supply'
const wallet = '0x1111111111111111111111111111111111111111'
let jobs: Array<Record<string, unknown>>
let ratings: Array<Record<string, unknown>>
beforeEach(() => {
  jobs = QUEST_CATEGORIES.map((category, i) => ({
    chain_id: 56, job_id: String(i), client: wallet, provider: '0x2222222222222222222222222222222222222222',
    funded_raw: '1', state: 'SUBMITTED', intent_id: `local-intent-${i}`, i_id: `local-intent-${i}`,
    a_id: `local-fixture-${i}`, a_token: String(900000 + i), a_name: `Local fixture ${i}`, a_owner: '0x3333333333333333333333333333333333333333', i_category: category,
    ev: { JobCreated: { tx: `create-${i}`, at: null }, JobFunded: { tx: `fund-${i}`, at: null }, JobSubmitted: { tx: `submit-${i}`, at: null } },
  }))
  ratings = []
  execute.mockReset().mockImplementation(async q => {
    const { sql } = new PgDialect().sqlToQuery(q)
    if (sql.includes('from commerce_job')) return jobs
    if (sql.includes('from rating')) return ratings
    if (sql.includes('from commerce_event')) return [{ block_number: 200 }]
    if (sql.includes('from builder_listing')) return []
    throw new Error('Unexpected query in read-only quest regression')
  })
})
describe('local quest protections and economic states', () => {
  it('preserves all four categories and separates submitted work from settlement and payment', async () => {
    const view = await walletQuest(wallet, 56)
    expect(Object.keys(view.quest.categories)).toEqual(['yield', 'grid', 'rebalancing', 'health_factor'])
    expect(view.totals).toMatchObject({ deposits: 4, delivered: 4, settled: 0, ratings: 0 })
    expect(view.hires.every(h => h.tx.submitted && !h.tx.completed && !h.tx.paymentReleased)).toBe(true)
    expect(view.quest.ratedAll).toBe(false)
  })
  it('keeps team activity visible and ineligible', async () => {
    const team = teamWallets()[0]!
    jobs.forEach(j => { j.client = team })
    const view = await walletQuest(team.toUpperCase().replace('0X', '0x'), 56)
    expect(view.quest).toMatchObject({ eligible: false, reasons: ['team_wallet'] })
    expect(view.hires).toHaveLength(4)
    expect(view.hires.every(h => !h.eligible && h.reasons.includes('team_wallet'))).toBe(true)
  })
  it.each(['self_hire', 'zero_deposit', 'not_marque'])('retains excluded %s jobs without counting them as eligible', async reason => {
    if (reason === 'self_hire') jobs[0]!.a_owner = wallet
    if (reason === 'zero_deposit') jobs[0]!.funded_raw = '0'
    if (reason === 'not_marque') jobs[0]!.intent_id = null
    const view = await walletQuest(wallet, 56)
    expect(view.hires[0]).toMatchObject({ eligible: false, reasons: expect.arrayContaining([reason]) })
    if (reason !== 'self_hire') expect(view.quest.categories.yield.done).toBe(false)
  })
  it('does not treat unrelated feedback or a pre-submission rating as verified progress', async () => {
    ratings = [
      { chain_id: 56, agent_token_id: 'unrelated', value: 100, value_decimals: 0, tx_hash: 'other', block_number: 300, revoked: false },
      { chain_id: 56, agent_token_id: '900000', value: 100, value_decimals: 0, tx_hash: 'early', block_number: 100, revoked: false },
    ]
    const view = await walletQuest(wallet, 56)
    expect(view.quest.ratedAll).toBe(false)
    expect(view.hires[0]!.reasons).toContain('rating_unbound')
    expect(view.hires[1]!.rating).toBeNull()
  })
})
