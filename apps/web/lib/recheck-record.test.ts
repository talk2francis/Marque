import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], queries: [] as unknown[], notify: vi.fn() }))
vi.mock('@marque/db', () => ({
  db: () => ({ transaction: async (fn: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<unknown>) => fn({ execute: async q => { h.queries.push(q); return h.queries.length % 3 === 0 ? h.rows : [] } }) }),
  firstPartyAgentsAllLanes: () => [{ chainId: 56, tokenId: 11, slug: 'keel', category: 'health_factor' }, { chainId: 97, tokenId: 12, slug: 'keel', category: 'health_factor' }],
}))
vi.mock('@marque/commerce', () => ({ deliverableUrlFromNotify: h.notify }))
import { recheckRecord } from './recheck-record'
const row = () => ({ block: '123456789', checks: [], category: null, job_id: '123', provider: `0x${'1'.repeat(40)}`, deliverable: `0x${'2'.repeat(64)}`, token_id: null, submitted_tx: `0x${'3'.repeat(64)}` })
beforeEach(() => { h.rows = [row()]; h.queries = []; h.notify.mockReset().mockResolvedValue('https://example.org/original.json') })
describe('minimal original answer projection', () => {
  it('preserves exact provider, commitment, submission and announced URL without reading ratings', async () => {
    const r = await recheckRecord(56, '123')
    expect(r?.job).toEqual({ provider: row().provider, deliverable: { hash: row().deliverable, url: 'https://example.org/original.json' }, events: [{ name: 'JobSubmitted', tx: row().submitted_tx }] })
    const dialect = new PgDialect(), compiled = h.queries.map(q => dialect.sqlToQuery(q as Parameters<typeof dialect.sqlToQuery>[0]))
    expect(compiled[0]?.sql).toBe('set transaction read only')
    expect(compiled[2]?.params).toEqual([56, '123'])
    expect(compiled[2]?.sql).toContain('i.chain_id = j.chain_id and i.job_id = j.job_id')
    expect(compiled[2]?.sql).toContain('sibling.id <> a.id')
    expect(compiled[2]?.sql).not.toMatch(/\brating\b|\brating_comment\b/)
  })
  it.each([[56, '11', 'https://marque.trade/agents/keel/erc8183/job/123/response'], [97, '12', 'https://marque.trade/agents/keel/testnet/erc8183/job/123/response']] as const)('uses only the chain-qualified reference identity on %i', async (chain, token, url) => {
    h.rows[0]!.token_id = token
    const r = await recheckRecord(chain, '123')
    expect(r?.category).toBe('health_factor'); expect(r?.job?.deliverable.url).toBe(url)
    expect(h.notify).not.toHaveBeenCalled()
  })
  it('does not substitute a reference from another network or invent a submission', async () => {
    h.rows[0]!.token_id = '11'; h.rows[0]!.submitted_tx = null
    const r = await recheckRecord(97, '123')
    expect(r?.category).toBeNull(); expect(r?.job?.events).toEqual([])
    expect(r?.job?.deliverable.url).toBe('https://example.org/original.json')
  })
  it('keeps a missing job distinct from a missing original result', async () => {
    h.rows[0]!.job_id = null
    expect((await recheckRecord(56, '123'))?.job).toBeNull()
    h.rows = []; expect(await recheckRecord(56, '123')).toBeNull()
    expect(h.notify).not.toHaveBeenCalled()
  })
})
