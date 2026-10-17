import { z } from 'zod'
import { keccak256, toBytes } from 'viem'
import { catalogQuerySchema, machineCatalogSchema } from './catalog-contract.js'
import { sanitizeForClaim } from './description.js'

const address = z.string().regex(/^0x[\da-fA-F]{40}$/).refine(x => !/^0x0{40}$/i.test(x))
const raw = z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(x => BigInt(x) < 2n ** 256n)
export const routingIntentSchema = z.object({
  category: catalogQuerySchema.innerType().shape.category.unwrap(),
  task: z.string().trim().min(3).max(1200),
  chainId: z.union([z.literal(56), z.literal(97)]),
  budget: z.object({ tokenAddress: address, decimals: z.number().int().min(0).max(255), maxAmountRaw: raw }).strict(),
  objectives: z.array(z.enum(['price', 'fresh_usable_evidence', 'confirmed_settlement', 'least_authority']))
    .min(1).max(4).refine(x => new Set(x).size === x.length, 'Duplicate objective'),
}).strict()
export const routingInputSchema = z.object({
  schema: z.literal('marque.routing-input.v1'),
  asOf: z.string().datetime(), intent: routingIntentSchema, catalog: machineCatalogSchema,
}).strict()
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const MAX_SOURCE_AGE_MS = 300_000

/** Pure inspection of an existing v1 catalog page. It has no task-bound evidence,
 * so this adapter cannot qualify a provider or create a recommended winner. */
export function explainCandidates(value: unknown) {
  const { asOf, intent, catalog } = routingInputSchema.parse(value)
  const now = Date.parse(asOf)
  const sourceAgeMs = catalog.sourceComputedAt === null ? null : now - Date.parse(catalog.sourceComputedAt)
  const sourceStale = catalog.stale || sourceAgeMs === null || sourceAgeMs < -30_000 || sourceAgeMs > MAX_SOURCE_AGE_MS
  const selectionKey = (agentId: string, serviceId: number | null, provider: string | null) => `${agentId.toLowerCase()}/${serviceId ?? 'unknown'}/${provider?.toLowerCase() ?? 'unknown'}`
  const counts = new Map<string, number>()
  for (const a of catalog.agents) {
    const key = selectionKey(a.agentId, a.selectedService.serviceId, a.selectedService.provider)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const candidates = catalog.agents.map(a => {
    const rejected: string[] = []
    const unknown = [
      'exact_task_support_unknown', 'exact_service_quality_unknown', 'current_ownership_not_rechecked',
      'human_and_funding_independence_unknown', 'confirmed_settlement_not_in_catalog', 'action_authority_not_in_catalog',
      'endpoint_binding_not_in_catalog', 'fresh_task_quote_and_commitment_required',
    ]
    const key = selectionKey(a.agentId, a.selectedService.serviceId, a.selectedService.provider)
    if ((counts.get(key) ?? 0) > 1) rejected.push('duplicate_selection')
    if (a.category !== intent.category) rejected.push(a.category === null ? 'category_unknown' : 'category_mismatch')
    const identity = /^(56|97):(0x[\da-fA-F]{40}):(0|[1-9]\d{0,77})$/.exec(a.agentId)
    if (!identity || Number(identity[1]) !== a.identity.chainId || identity[3] !== a.identity.tokenId || BigInt(identity[3]!) >= 2n ** 256n) rejected.push('identity_fields_inconsistent')
    if (a.selectedService.serviceId === null || !Number.isSafeInteger(a.selectedService.serviceId) || a.selectedService.serviceId > 2_147_483_647 || a.selectedService.provider === null || /^0x0{40}$/i.test(a.selectedService.provider)) rejected.push('exact_service_unavailable')
    if (a.selectedService.chainId !== intent.chainId) rejected.push('action_chain_mismatch')
    if (a.payableRails.erc8183.state !== 'CANDIDATE_REQUIRES_FRESH_QUOTE') rejected.push('escrow_quote_unavailable')
    if (sourceStale) unknown.push('catalog_source_stale_or_unknown')

    const p = a.price
    const observed = p.observedAt === null ? null : Date.parse(p.observedAt)
    const expires = p.expiresAt === null ? null : Date.parse(p.expiresAt)
    let amountRaw: string | null = null
    let budgetState: 'WITHIN_BUDGET' | 'OVER_BUDGET' | 'NOT_COMPARABLE' | 'UNKNOWN' = 'UNKNOWN'
    if (p.state === 'EXPIRED' || (expires !== null && expires <= now)) rejected.push('stored_quote_expired')
    else if (p.state !== 'CURRENT' || observed === null || expires === null || p.amountRaw === null || p.token === null) unknown.push('current_price_unknown')
    else if (observed > now + 30_000 || now - observed > 900_000 || expires - observed > 900_000 || expires <= observed || BigInt(p.amountRaw) === 0n || BigInt(p.amountRaw) >= 2n ** 256n) rejected.push('invalid_quote_observation')
    else if (p.chainId !== intent.chainId || a.selectedService.chainId !== p.chainId || !same(p.token.address, intent.budget.tokenAddress) || p.token.decimals !== intent.budget.decimals) {
      budgetState = 'NOT_COMPARABLE'; rejected.push('payment_asset_not_comparable')
    } else if (sourceStale) unknown.push('price_requires_fresh_source')
    else {
      amountRaw = p.amountRaw
      budgetState = BigInt(amountRaw) <= BigInt(intent.budget.maxAmountRaw) ? 'WITHIN_BUDGET' : 'OVER_BUDGET'
      if (budgetState === 'OVER_BUDGET') rejected.push('over_budget')
    }
    return {
      selectionKey: key, agentId: a.agentId, name: a.name, serviceId: a.selectedService.serviceId,
      provider: a.selectedService.provider, identityChainId: a.identity.chainId, actionChainId: a.selectedService.chainId,
      firstParty: a.ownership.firstParty, ownershipProvenance: a.ownership.source,
      state: rejected.length ? 'REJECTED' as const : 'UNKNOWN' as const, rejected, unknown,
      categoryMatch: a.category === intent.category, eligible: false as const,
      price: { storedQuoteState: p.state, budgetState, amountRaw, token: p.token, chainId: p.chainId, provenance: p.provenance, observedAt: p.observedAt, expiresAt: p.expiresAt, observedQuoteMode: p.quoteMode, taskBinding: p.taskBinding },
      conformanceObservation: a.conformance, probeObservation: a.observation,
      commerceObservation: a.payableRails.erc8183,
      // No global trust score, imputed settlement, latency or judgement quality.
      objectives: { freshUsableEvidence: null, confirmedSettlement: null, leastAuthority: null },
    }
  })
  candidates.sort((a, b) => {
    // Inspection order only. Unknown objectives tie; house status is never a key.
    for (const objective of intent.objectives) {
      if (objective !== 'price') continue
      const av = a.price.amountRaw, bv = b.price.amountRaw
      if (av === null && bv !== null) return 1
      if (av !== null && bv === null) return -1
      if (av !== null && bv !== null && BigInt(av) !== BigInt(bv)) return BigInt(av) < BigInt(bv) ? -1 : 1
    }
    return compare(a.selectionKey, b.selectionKey) || compare(JSON.stringify(a), JSON.stringify(b))
  })
  return {
    schema: 'marque.routing-diagnostics.v1' as const,
    provenance: 'DERIVED_FROM_SUPPLIED_CATALOG_NOT_AUTHENTICATED' as const,
    state: 'insufficient_comparable_supply' as const, recommended: null, autoHire: false as const,
    intent, taskTextHash: keccak256(toBytes(sanitizeForClaim(intent.task))), taskTextHashVersion: 'SDK_SANITIZED_TEXT_KECCAK256_V1' as const,
    snapshot: { asOf, exportedAt: catalog.generatedAt, sourceComputedAt: catalog.sourceComputedAt, sourceAgeMs, sourceStale,
      sampleScope: 'SUPPLIED_CATALOG_PAGE_ONLY' as const, suppliedEntries: candidates.length, catalogTotal: catalog.page.total,
      incomplete: catalog.page.hasMore || catalog.page.offset !== 0 || catalog.page.total !== candidates.length },
    inspectionOrder: { objectives: intent.objectives, tieBreak: 'ASCII_SELECTION_KEY_THEN_CANONICAL_PARSED_CANDIDATE', meaning: 'NOT_A_QUALIFIED_PROVIDER_RANKING', unknownObjectives: 'TIE_WITHOUT_IMPUTATION' },
    candidates, eligibleSelections: [], manualBrowse: `/register?category=${encodeURIComponent(intent.category)}`,
    limitations: [
      'Catalog v1 cannot establish exact-task acceptance, fresh exact-service quality or a comparable provider pair.',
      'Prices compare raw integer units only with the same action chain, token address and decimals; no exchange rate or gas estimate.',
      'Stored quote mode is an observation, not a fresh signature replay or hire authorization.',
      'No current chain, consent, operator independence, settlement or charter inspection performed.',
      'Collect fresh exact-task quotes and inspect existing hire/plan evidence manually; no candidate is auto-hired.',
    ],
  }
}
