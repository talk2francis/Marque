import { z } from 'zod'

const address = z.string().regex(/^0x[\da-fA-F]{40}$/)
const chain = z.union([z.literal(56), z.literal(97)])
const time = z.string().datetime()
const raw = z.string().regex(/^(0|[1-9]\d{0,77})$/)
export const catalogQuerySchema = z.object({
  category: z.enum(['rebalancing', 'grid', 'yield', 'health_factor', 'security']).optional(),
  q: z.string().trim().max(120).optional(),
  live: z.boolean().optional(), warranted: z.boolean().optional(), thirdParty: z.boolean().optional(),
  hireable: z.boolean().optional(), includeUnclassified: z.boolean().optional(), hasPrice: z.boolean().optional(), firstParty: z.boolean().optional(),
  network: chain.optional(), token: z.string().regex(/^[A-Za-z0-9]{1,12}$/).optional(),
  iface: z.enum(['a2a', 'mcp', 'x402', 'erc8183']).optional(),
  tab: z.enum(['ready', 'free', 'tested', 'all']).optional(),
  sort: z.enum(['best', 'proven', 'price', 'fast', 'recent', 'rated']).optional(),
  maxPrice: z.number().finite().nonnegative().optional(), minRating: z.number().finite().min(0).max(5).optional(),
  limit: z.number().int().min(1).max(300).optional(), offset: z.number().int().min(0).max(1_000_000).optional(),
}).strict().refine(x => !(x.firstParty && x.thirdParty), 'Choose one ownership filter')
export type CatalogQuery = z.infer<typeof catalogQuerySchema>

export const machineEntrySchema = z.object({
  agentId: z.string().max(200), name: z.string().max(4000), category: z.string().max(100).nullable(),
  identity: z.object({ chainId: chain.nullable(), tokenId: raw.nullable(), registrationIsQualityProof: z.literal(false) }),
  ownership: z.object({ owner: address.nullable(), firstParty: z.boolean(), identityCount: z.number().int().nonnegative(), source: z.literal('INDEXED_AND_CONFIGURED'), freshness: z.literal('NOT_RECHECKED_ONCHAIN'), humanAndFundingIndependence: z.literal('UNKNOWN') }),
  discovery: z.object({ interfaces: z.array(z.string().max(100)).max(30), protocols: z.array(z.string().max(100)).max(30), source: z.literal('INDEXED_DECLARATIONS') }),
  selectedService: z.object({ serviceId: z.number().int().positive().nullable(), chainId: chain.nullable(), provider: address.nullable(), transport: z.literal('UNKNOWN_IN_EXISTING_PROJECTION'), inventoryScope: z.literal('ONE_SELECTED_COMMERCIAL_SERVICE_PER_ENTRY'), exactTaskSupport: z.literal('UNKNOWN_REQUEST_EXACT_TASK_QUOTE') }),
  payableRails: z.object({ erc8183: z.object({ state: z.enum(['CANDIDATE_REQUIRES_FRESH_QUOTE', 'UNAVAILABLE']), failure: z.string().max(1000).nullable() }), x402: z.object({ discovered: z.boolean(), buyerSupport: z.literal('UNSUPPORTED') }), a2aAndMcp: z.literal('DISCOVERY_TRANSPORTS_NOT_PAYMENT_RAILS') }),
  price: z.object({ state: z.enum(['CURRENT', 'EXPIRED', 'UNKNOWN']), amountRaw: raw.nullable(), token: z.object({ address, symbol: z.string().max(20), decimals: z.number().int().min(0).max(255) }).nullable(), chainId: chain.nullable(), observedAt: time.nullable(), expiresAt: time.nullable(), quoteMode: z.enum(['provider_signed', 'identity_matched_unsigned', 'unknown']), provenance: z.literal('STORED_QUOTE_OBSERVATION'), taskBinding: z.literal('UNKNOWN_UNTIL_FRESH_QUOTE') }),
  observation: z.object({ liveness: z.string().max(100).nullable(), latencyMs: z.number().nonnegative().nullable(), sampleTime: z.null(), recency: z.literal('EXACT_PROBE_TIME_NOT_IN_EXISTING_PROJECTION') }),
  conformance: z.object({ state: z.enum(['IDENTITY_TEST_PASSED', 'IDENTITY_TEST_FAILED', 'UNTESTED']), testId: z.string().max(100).nullable(), observedAt: time.nullable(), exactServiceBinding: z.literal('UNKNOWN'), paymentProof: z.literal('NOT_IMPLIED') }),
  links: z.object({ hireMetadata: z.string(), profile: z.string().nullable() }),
}).strict()
export const machineCatalogSchema = z.object({
  schema: z.literal('marque.catalog.v1'), version: z.literal(1), generatedAt: time, sourceComputedAt: time.nullable(),
  provenance: z.literal('MEASURED_PROJECTION'), sourceAgeMs: z.number().nonnegative().nullable(), stale: z.boolean(),
  page: z.object({ count: z.number().int().nonnegative(), total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), limit: z.number().int().min(1).max(300), hasMore: z.boolean(), nextOffset: z.number().int().nonnegative().nullable(), population: z.literal('FILTERED_DEDUPLICATED_MARKETPLACE_ENTRIES') }),
  agents: z.array(machineEntrySchema).max(300),
  cacheMaxAgeSeconds: z.number().int().min(0).max(15), limitations: z.array(z.string()),
}).strict().refine(x => x.page.count === x.agents.length && x.page.total >= x.page.count, 'Invalid page population')
export type MachineCatalog = z.infer<typeof machineCatalogSchema>

/** Strict opt-in parser; legacy endpoint parameter behavior is preserved separately. */
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery | null {
  const booleans = new Set(['live', 'warranted', 'thirdParty', 'hireable', 'includeUnclassified', 'hasPrice', 'firstParty'])
  const numbers = new Set(['network', 'maxPrice', 'minRating', 'limit', 'offset'])
  const values: Record<string, unknown> = {}
  for (const [k, value] of params) {
    if (k === 'format') continue
    if (Object.hasOwn(values, k)) return null
    if (booleans.has(k)) {
      if (!['1', '0', 'true', 'false'].includes(value)) return null
      values[k] = value === '1' || value === 'true'
    } else if (numbers.has(k)) {
      if (!value.trim()) return null
      values[k] = Number(value)
    } else values[k] = value
  }
  const p = catalogQuerySchema.safeParse(values)
  return p.success ? p.data : null
}
