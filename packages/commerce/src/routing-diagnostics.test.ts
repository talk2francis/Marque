import { describe, expect, it, vi } from 'vitest'
import { explainCandidates, routingInputSchema } from './routing-diagnostics.js'
import type { MachineCatalog } from './catalog-contract.js'

// Every value here is synthetic, including addresses, chain block implications and prices.
const token = `0x${'1'.repeat(40)}`
const asOf = '2026-10-17T00:01:00.000Z'
const entry = (id: number): MachineCatalog['agents'][number] => ({
  agentId: `56:0x${'8'.repeat(40)}:${id}`, name: `Synthetic ${id}`, category: 'grid',
  identity: { chainId: 56, tokenId: String(id), registrationIsQualityProof: false },
  ownership: { owner: token, firstParty: false, identityCount: 1, source: 'INDEXED_AND_CONFIGURED', freshness: 'NOT_RECHECKED_ONCHAIN', humanAndFundingIndependence: 'UNKNOWN' },
  discovery: { interfaces: ['a2a'], protocols: ['erc8183'], source: 'INDEXED_DECLARATIONS' },
  selectedService: { serviceId: id, chainId: 56, provider: token, transport: 'UNKNOWN_IN_EXISTING_PROJECTION', inventoryScope: 'ONE_SELECTED_COMMERCIAL_SERVICE_PER_ENTRY', exactTaskSupport: 'UNKNOWN_REQUEST_EXACT_TASK_QUOTE' },
  payableRails: { erc8183: { state: 'CANDIDATE_REQUIRES_FRESH_QUOTE', failure: null }, x402: { discovered: false, buyerSupport: 'UNSUPPORTED' }, a2aAndMcp: 'DISCOVERY_TRANSPORTS_NOT_PAYMENT_RAILS' },
  price: { state: 'CURRENT', amountRaw: '100', token: { address: token, symbol: 'SYNTHETIC', decimals: 18 }, chainId: 56, observedAt: '2026-10-17T00:00:30.000Z', expiresAt: '2026-10-17T00:05:00.000Z', quoteMode: 'identity_matched_unsigned', provenance: 'STORED_QUOTE_OBSERVATION', taskBinding: 'UNKNOWN_UNTIL_FRESH_QUOTE' },
  observation: { liveness: null, latencyMs: null, sampleTime: null, recency: 'EXACT_PROBE_TIME_NOT_IN_EXISTING_PROJECTION' },
  conformance: { state: 'IDENTITY_TEST_PASSED', testId: 'synthetic-only', observedAt: asOf, exactServiceBinding: 'UNKNOWN', paymentProof: 'NOT_IMPLIED' },
  links: { hireMetadata: '/unused', profile: null },
})
const fixture = () => ({
  schema: 'marque.routing-input.v1', asOf,
  intent: { category: 'grid', task: 'Synthetic grid inspection only.', chainId: 56,
    budget: { tokenAddress: token, decimals: 18, maxAmountRaw: '1000' },
    objectives: ['price', 'fresh_usable_evidence', 'confirmed_settlement', 'least_authority'] },
  catalog: { schema: 'marque.catalog.v1', version: 1, generatedAt: asOf, sourceComputedAt: asOf, provenance: 'MEASURED_PROJECTION', sourceAgeMs: 0, stale: false,
    page: { count: 2, total: 2, offset: 0, limit: 10, hasMore: false, nextOffset: null, population: 'FILTERED_DEDUPLICATED_MARKETPLACE_ENTRIES' },
    agents: [entry(2), entry(1)], cacheMaxAgeSeconds: 0, limitations: ['Synthetic fixture only.'] },
})
describe('deterministic catalog suitability diagnostics, without a manufactured winner', () => {
  it('never promotes category, legacy test pass or stored unsigned quote to task suitability', () => {
    const r = explainCandidates(fixture())
    expect(r).toMatchObject({ state: 'insufficient_comparable_supply', recommended: null, autoHire: false, eligibleSelections: [], manualBrowse: '/register?category=grid' })
    expect(r.candidates.every(c => c.state === 'UNKNOWN' && !c.eligible)).toBe(true)
    expect(r.candidates[0]?.unknown).toContain('exact_service_quality_unknown')
    expect(r.candidates[0]?.objectives).toEqual({ freshUsableEvidence: null, confirmedSettlement: null, leastAuthority: null })
    expect(r.candidates[0]?.price.observedQuoteMode).toBe('identity_matched_unsigned')
  })
  it('has deterministic lexical ties, independent of row order and first-party status', () => {
    const a = fixture(); a.catalog.agents[0]!.ownership.firstParty = true
    const b = structuredClone(a); b.catalog.agents.reverse()
    expect(explainCandidates(a)).toEqual(explainCandidates(b))
    expect(explainCandidates(a).candidates.map(c => c.serviceId)).toEqual([1, 2])
    expect(explainCandidates(a).candidates[1]?.firstParty).toBe(true)
  })
  it('compares integer prices above Number precision without rounding', () => {
    const f = fixture(); f.intent.budget.maxAmountRaw = '9007199254740992'
    f.catalog.agents[0]!.price.amountRaw = '9007199254740992'
    f.catalog.agents[1]!.price.amountRaw = '9007199254740993'
    const r = explainCandidates(f)
    expect(r.candidates.map(c => c.serviceId)).toEqual([2, 1])
    expect(r.candidates[0]?.price.budgetState).toBe('WITHIN_BUDGET')
    expect(r.candidates[1]?.rejected).toContain('over_budget')
  })
  it('unknown objectives tie without secretly adding a price or house preference', () => {
    const f = fixture(); f.intent.objectives = ['confirmed_settlement', 'least_authority']
    f.catalog.agents[0]!.price.amountRaw = '1'
    f.catalog.agents[1]!.ownership.firstParty = true
    const r = explainCandidates(f)
    expect(r.candidates.map(c => c.serviceId)).toEqual([1, 2])
    expect(r.inspectionOrder.unknownObjectives).toBe('TIE_WITHOUT_IMPUTATION')
    expect(r.recommended).toBeNull()
  })
  it.each(['token', 'decimals', 'chain'] as const)('never normalizes incompatible %s into a comparable price', key => {
    const f = fixture(); const a = f.catalog.agents[0]!
    if (key === 'token') a.price.token!.address = `0x${'2'.repeat(40)}`
    if (key === 'decimals') a.price.token!.decimals = 6
    if (key === 'chain') a.price.chainId = 97
    const r = explainCandidates(f).candidates.find(c => c.serviceId === 2)!
    expect(r.price).toMatchObject({ budgetState: 'NOT_COMPARABLE', amountRaw: null })
    expect(r.rejected).toContain('payment_asset_not_comparable')
  })
  it.each(['expiry', 'cached_expiry', 'future', 'lifetime', 'zero'] as const)('rejects %s price evidence', kind => {
    const f = fixture(); const a = f.catalog.agents[0]!
    if (kind === 'expiry') a.price.expiresAt = asOf
    if (kind === 'cached_expiry') a.price.state = 'EXPIRED'
    if (kind === 'future') a.price.observedAt = '2026-10-17T01:00:00.000Z'
    if (kind === 'lifetime') a.price.expiresAt = '2026-10-18T00:00:00.000Z'
    if (kind === 'zero') a.price.amountRaw = '0'
    const r = explainCandidates(f).candidates.find(c => c.serviceId === 2)!
    expect(r.state).toBe('REJECTED'); expect(r.price.amountRaw).toBeNull()
  })
  it.each(['old', 'future', 'missing', 'flagged'] as const)('recomputes %s source freshness rather than trusting a cached good age', kind => {
    const f = fixture()
    if (kind === 'old') f.catalog.sourceComputedAt = '2026-10-16T00:00:00.000Z'
    if (kind === 'future') f.catalog.sourceComputedAt = '2026-10-18T00:00:00.000Z'
    if (kind === 'missing') { const p = routingInputSchema.parse(f); p.catalog.sourceComputedAt = null; expect(explainCandidates(p).snapshot.sourceStale).toBe(true); return }
    if (kind === 'flagged') f.catalog.stale = true
    const r = explainCandidates(f)
    expect(r.snapshot.sourceStale).toBe(true)
    expect(r.candidates.every(c => c.price.amountRaw === null && c.unknown.includes('catalog_source_stale_or_unknown'))).toBe(true)
  })
  it('retains rejection reasons and exact selected tuple without fallback', () => {
    const f = fixture(); f.catalog.agents[0]!.category = 'yield'; f.catalog.agents[0]!.selectedService.chainId = 97
    const r = explainCandidates(f).candidates.find(c => c.serviceId === 2)!
    expect(r.rejected).toEqual(['category_mismatch', 'action_chain_mismatch', 'payment_asset_not_comparable'])
    expect(r).toMatchObject({ agentId: f.catalog.agents[0]!.agentId, serviceId: 2, provider: token, identityChainId: 56, actionChainId: 97 })
  })
  it('distinguishes identity chain from action chain', () => {
    const f = fixture(); f.intent.chainId = 97
    for (const a of f.catalog.agents) { a.selectedService.chainId = 97; a.price.chainId = 97 }
    expect(explainCandidates(f).candidates.every(c => !c.rejected.includes('action_chain_mismatch'))).toBe(true)
  })
  it('does not inflate duplicate selection into independent supply', () => {
    const f = fixture(); f.catalog.agents[1] = structuredClone(f.catalog.agents[0]!)
    expect(explainCandidates(f).candidates.every(c => c.rejected.includes('duplicate_selection'))).toBe(true)
    expect(explainCandidates(f).recommended).toBeNull()
  })
  it.each([0, 1])('handles %s entries and page incompleteness without inferred population', count => {
    const f = fixture(); f.catalog.agents = f.catalog.agents.slice(0, count); f.catalog.page.count = count
    const r = explainCandidates(f)
    expect(r).toMatchObject({ state: 'insufficient_comparable_supply', recommended: null, snapshot: { suppliedEntries: count, catalogTotal: 2, incomplete: true } })
  })
  it('rejects unsupported intent, unknown schema fields, unsafe budget and duplicate objectives', () => {
    const f = fixture()
    expect(() => explainCandidates({ ...f, autoHire: true })).toThrow()
    f.intent.objectives = ['price', 'price']; expect(() => explainCandidates(f)).toThrow()
    const g = fixture(); g.intent.budget.maxAmountRaw = (2n ** 256n).toString(); expect(() => explainCandidates(g)).toThrow()
    const h = fixture(); h.intent.chainId = 1; expect(() => explainCandidates(h)).toThrow()
  })
  it('does not fetch, sign, mutate inputs or use an implicit clock', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    try {
      const f = fixture(); const before = structuredClone(f)
      const a = explainCandidates(f); const b = explainCandidates(f)
      expect(a).toEqual(b); expect(f).toEqual(before); expect(fetcher).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
})
