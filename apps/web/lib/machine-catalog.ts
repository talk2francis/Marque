import { machineCatalogSchema } from '@marque/commerce/catalog'
import { assetAt } from '@marque/commerce'
import type { MarketRow } from './marketplace'

const address = (s: unknown) => typeof s === 'string' && /^0x[\da-fA-F]{40}$/.test(s) ? s : null
const chain = (n: unknown) => n === 56 || n === 97 ? n : null
const iso = (s: unknown) => typeof s === 'string' && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null
const raw = (s: unknown) => typeof s === 'string' && /^(0|[1-9]\d{0,77})$/.test(s) ? s : null

/** Projection only. No new queries, task probes, identity proof or remote calls. */
export function machineCatalog(input: { rows: MarketRow[]; generatedAt: string; total: number; offset: number; hasMore: boolean }, limit: number, nowMs = Date.now()) {
  const sourceComputedAt = iso(input.generatedAt)
  const age = sourceComputedAt ? nowMs - Date.parse(sourceComputedAt) : null
  const stale = age === null || age < 0 || age > 180_000
  let cache = stale ? 0 : 15
  const agents = input.rows.map(r => {
    const c = r.commerce
    const canonical = /^(56|97):0x[\da-fA-F]{40}:(0|[1-9]\d{0,77})$/.exec(r.agentId)
    const identityChain = canonical ? chain(Number(canonical[1])) : null
    const expiresAt = iso(c.quoteExpiresAt), observedAt = iso(c.quotedAt)
    const catalogAsset = c.token && chain(c.chainId) ? assetAt(c.chainId!, c.token.address) : null
    const asset = c.token && catalogAsset && c.token.decimals === catalogAsset.decimals && c.token.symbol === catalogAsset.symbol ? c.token : null
    const amount = raw(c.priceRaw)
    const priceState = expiresAt && Date.parse(expiresAt) <= nowMs ? 'EXPIRED' : expiresAt && observedAt && Date.parse(observedAt) <= nowMs + 30_000 && Date.parse(expiresAt) <= nowMs + 900_000 && amount !== null && asset && chain(c.chainId) ? 'CURRENT' : 'UNKNOWN'
    if (priceState === 'CURRENT') cache = Math.min(cache, Math.max(0, Math.floor((Date.parse(expiresAt!) - nowMs) / 1000)))
    const mode = c.sourceClaimVersion === 1 && ['provider_signed', 'identity_matched_unsigned'].includes(c.signatureEvidence ?? '') && c.signedQuote === (c.signatureEvidence === 'provider_signed') ? c.signatureEvidence! : 'unknown'
    const failure = c.failure && /^[a-z][a-z0-9_]{0,79}$/.test(c.failure) ? c.failure : null
    return {
      agentId: r.agentId, name: r.name, category: r.category,
      identity: { chainId: identityChain, tokenId: canonical?.[2] ?? null, registrationIsQualityProof: false },
      ownership: { owner: address(r.owner), firstParty: r.isReference, identityCount: r.identityCount, source: 'INDEXED_AND_CONFIGURED', freshness: 'NOT_RECHECKED_ONCHAIN', humanAndFundingIndependence: 'UNKNOWN' },
      discovery: { interfaces: r.interfaces, protocols: r.protocols, source: 'INDEXED_DECLARATIONS' },
      selectedService: { serviceId: c.serviceId, chainId: chain(c.chainId), provider: address(c.provider), transport: 'UNKNOWN_IN_EXISTING_PROJECTION', inventoryScope: 'ONE_SELECTED_COMMERCIAL_SERVICE_PER_ENTRY', exactTaskSupport: 'UNKNOWN_REQUEST_EXACT_TASK_QUOTE' },
      payableRails: { erc8183: { state: priceState === 'CURRENT' && (c.state === 'hireable' || c.state === 'settleable') ? 'CANDIDATE_REQUIRES_FRESH_QUOTE' : 'UNAVAILABLE', failure: priceState === 'EXPIRED' ? 'expired' : failure }, x402: { discovered: r.protocols.includes('x402') || r.interfaces.includes('x402'), buyerSupport: 'UNSUPPORTED' }, a2aAndMcp: 'DISCOVERY_TRANSPORTS_NOT_PAYMENT_RAILS' },
      price: { state: priceState, amountRaw: priceState === 'CURRENT' ? amount : null, token: priceState === 'CURRENT' ? asset : null, chainId: chain(c.chainId), observedAt, expiresAt, quoteMode: mode, provenance: 'STORED_QUOTE_OBSERVATION', taskBinding: 'UNKNOWN_UNTIL_FRESH_QUOTE' },
      observation: { liveness: r.liveness, latencyMs: r.latencyMs, sampleTime: null, recency: 'EXACT_PROBE_TIME_NOT_IN_EXISTING_PROJECTION' },
      conformance: { state: r.warrant.status === 'warranted' ? 'IDENTITY_TEST_PASSED' : r.warrant.status === 'failed' ? 'IDENTITY_TEST_FAILED' : 'UNTESTED', testId: r.warrant.testId, observedAt: iso(r.warrant.date), exactServiceBinding: 'UNKNOWN', paymentProof: 'NOT_IMPLIED' },
      links: { hireMetadata: `/api/v1/hire/agent?agentId=${encodeURIComponent(r.agentId)}${c.serviceId ? `&serviceId=${c.serviceId}` : ''}`, profile: canonical ? `/agents/${canonical[1]}/${canonical[2]}` : null },
    }
  })
  return machineCatalogSchema.parse({
    schema: 'marque.catalog.v1', version: 1, generatedAt: new Date(nowMs).toISOString(), sourceComputedAt,
    provenance: 'MEASURED_PROJECTION', sourceAgeMs: age !== null && age >= 0 ? age : null, stale,
    page: { count: agents.length, total: input.total, offset: input.offset, limit, hasMore: input.hasMore, nextOffset: input.hasMore ? input.offset + agents.length : null, population: 'FILTERED_DEDUPLICATED_MARKETPLACE_ENTRIES' },
    agents, cacheMaxAgeSeconds: cache,
    limitations: ['One selected commercial service per existing deduplicated entry; additional services are not enumerated here.', 'Projection time is not each probe, quote, registry or feedback observation time.', 'A candidate quote and identity test pass are not an exact-task hire, independent person, safety guarantee or paid outcome.', 'Request an exact-task quote and recheck current identity, chain, asset and intent binding before any user signature.'],
  })
}
