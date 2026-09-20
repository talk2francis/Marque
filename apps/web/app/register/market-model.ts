/**
 * The marketplace's shared display model.
 *
 * Pure data and pure functions — no JSX, no fetching, no state. Everything here
 * maps the EXACT rows `/api/v1/marketplace` already returns onto buyer-facing
 * language.
 *
 * The internal vocabulary (warranted / failed / callable / unbound / dead) is
 * never rewritten, only re-layered: a buyer reads "Qualified", and one level
 * down a judge still reads "Warranted · MCS-REB-1 · 2026-09-08". No fact is
 * dropped, softened or invented on the way through.
 */
import { referenceAgent } from '../../lib/reference-agents'

/** Mirrors the `/api/v1/marketplace` row exactly. Nothing added, nothing renamed. */
export interface MarketRow {
  agentId: string
  tokenId: string | null
  name: string
  category: string | null
  isReference: boolean
  identityCount: number
  owner?: string | null
  ownerLabel: string | null
  host: string | null
  identity: {
    imageUrl: string | null
    description: string | null
    contractAddress: string | null
    website: string | null
    x402: boolean
    registeredAt: string | null
  }
  liveness: string | null
  latencyMs: number | null
  interfaces: string[]
  protocols: string[]
  price: string | null
  warrant: {
    status: 'warranted' | 'failed' | 'untested'
    testId: string | null
    date: string | null
    failedField: string | null
  }
  qual: 'warranted' | 'failed' | 'callable' | 'unbound' | 'dead'
  previewable: boolean
  hireBlockedReason: string | null
}

export const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing',
  grid: 'Grid trading',
  yield: 'Yield',
  health_factor: 'Health factor',
  security: 'Security',
}

/**
 * URL slug per category. `health-factor` reads better in an address bar than the
 * stored `health_factor`, which is why the route already differs from the value.
 */
export const CATEGORY_SLUG: Record<string, string> = {
  rebalancing: 'rebalancing',
  grid: 'grid',
  yield: 'yield',
  health_factor: 'health-factor',
  security: 'security',
}

export interface CategoryTab {
  value: string | null
  label: string
}

/**
 * The four official BNB categories a judge is scoring, plus All. Security is a
 * real category with real supply but no published MCS test, so it is kept
 * reachable and visually subordinate rather than presented as a fifth official
 * one (see SUPPLEMENTAL_CATEGORIES).
 */
export const PRIMARY_CATEGORIES: CategoryTab[] = [
  { value: null, label: 'All' },
  { value: 'rebalancing', label: 'Rebalancing' },
  { value: 'grid', label: 'Grid trading' },
  { value: 'yield', label: 'Yield' },
  { value: 'health_factor', label: 'Health factor' },
]
export const SUPPLEMENTAL_CATEGORIES: CategoryTab[] = [{ value: 'security', label: 'Security' }]

/** Unchanged backend sort values. No invented ordering. */
export const SORTS: Array<{ value: string; label: string }> = [
  { value: 'best', label: 'Best match' },
  { value: 'proven', label: 'Most proven' },
  { value: 'price', label: 'Lowest price' },
  { value: 'fast', label: 'Fastest' },
  { value: 'recent', label: 'Recently tested' },
]

/** Unchanged `iface` query values; only the labels are cased for reading. */
export const IFACES: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'Any' },
  { value: 'a2a', label: 'A2A' },
  { value: 'mcp', label: 'MCP' },
  { value: 'x402', label: 'x402' },
  { value: 'erc8183', label: 'ERC-8183' },
]

export function ifaceLabel(v: string | null): string {
  return IFACES.find((i) => i.value === v)?.label ?? String(v)
}

/**
 * Reference agents live at /agents/<slug>; third parties at /agents/56/<tokenId>
 * when there is a numeric token id, else they have no profile page. Identical to
 * the rule the marketplace has always used.
 */
export function profileHref(a: MarketRow): string | null {
  if (a.isReference) return `/agents/${a.tokenId}`
  if (a.tokenId && /^\d+$/.test(a.tokenId)) return `/agents/56/${a.tokenId}`
  return null
}

/** The four categories the charter desk has a template for. */
const CHARTER_CATEGORIES = new Set(['rebalancing', 'grid', 'yield', 'health_factor'])

/**
 * The charter desk URL.
 *
 * Only pass a category the desk actually has a template for. Most third-party
 * agents are `unclassified`, and sending that made the desk fall back to
 * rebalancing — which is how a Hire click on a third party ended up on a
 * Marque agent's charter. The agent id is the part that matters; the desk
 * resolves it directly.
 */
export function hireHref(a: MarketRow): string {
  const cat = a.category && CHARTER_CATEGORIES.has(a.category) ? `&category=${a.category}` : ''
  return `/app/charter?agent=${encodeURIComponent(a.agentId)}${cat}`
}

export function isoDay(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

/** The same 72h window the shared WarrantBadge uses. A pass is a claim about now. */
export const WARRANT_TTL_MS = 72 * 3_600_000
export function warrantIsStale(date: string | null): boolean {
  if (!date) return false
  const t = Date.parse(date)
  return Number.isNaN(t) ? false : Date.now() - t > WARRANT_TTL_MS
}

/** `improvementThreshold` -> `improvement threshold`. Display only. */
function humanField(f: string): string {
  return f
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
}

export type QualTone = 'qualified' | 'stale' | 'failed' | 'callable' | 'unavailable'

export interface QualView {
  tone: QualTone
  /** What a buyer reads first. */
  label: string
  /** The evidence line directly beneath it. Null when there is nothing true to say. */
  evidence: string | null
  /** The measurement date, kept separate so it can never break mid-value. */
  date: string | null
  /** A qualifier on the evidence — currently only a lapsed retest window. */
  flag: string | null
  /** The raw internal record, for the technical layer. Null when there is none. */
  detail: string | null
  /** Plain-language explanation for the tooltip / expanded detail. */
  title: string
}

/**
 * One row's qualification, in three layers: the buyer's word, the evidence, and
 * the raw test record. Derived only from `warrant` and `liveness` — the same
 * fields the API already sends, read the same way.
 */
export function qualView(a: MarketRow): QualView {
  const day = isoDay(a.warrant.date)
  const cat = a.category && a.category !== 'unclassified' ? (CATEGORY_LABEL[a.category] ?? a.category) : null

  if (a.warrant.status === 'warranted') {
    const stale = warrantIsStale(a.warrant.date)
    return {
      tone: stale ? 'stale' : 'qualified',
      label: 'Qualified',
      evidence: ['Warranted', a.warrant.testId].filter(Boolean).join(' · '),
      date: day,
      // Kept on its own line rather than appended: a lapsed retest window is a
      // caveat on the pass, not more of the citation, and appending it made the
      // date wrap mid-value.
      flag: stale ? 'Retest due' : null,
      detail: a.warrant.testId,
      title: stale
        ? 'Passed Marque’s published category-specific conformance test. The pass is more than 72 hours old, so a retest is due and it is not shown as current.'
        : 'Passed Marque’s published category-specific conformance test.',
    }
  }

  if (a.warrant.status === 'failed') {
    const reason = a.warrant.failedField ? humanField(a.warrant.failedField) : null
    return {
      tone: 'failed',
      label: 'Tested · not qualified',
      evidence: [cat, reason].filter(Boolean).join(' · ') || 'Did not pass',
      date: day,
      flag: null,
      detail: [a.warrant.testId, a.warrant.failedField].filter(Boolean).join(' · ') || null,
      title: `Ran Marque’s published test${a.warrant.testId ? ` ${a.warrant.testId}` : ''} and did not pass${
        a.warrant.failedField ? ` — failed field: ${a.warrant.failedField}` : ''
      }. The result is kept, not hidden.`,
    }
  }

  if (a.liveness === 'live') {
    return {
      tone: 'callable',
      label: 'Callable · not yet qualified',
      evidence: 'No published test run',
      date: null,
      flag: null,
      detail: null,
      title:
        'Answers a probe, so it can be called — but it has not been measured against Marque’s published test. Callability is not a warrant.',
    }
  }

  return {
    tone: 'unavailable',
    label: 'Unavailable',
    evidence: a.liveness ?? 'Did not answer',
    date: null,
    flag: null,
    detail: null,
    title: 'Did not answer Marque’s probe. Kept visible rather than deleted.',
  }
}

/**
 * Split an advertised price so the amount can carry the weight and the interval
 * can sit quietly under it. Never parses a number out to recompute it — the
 * string the provider published is shown verbatim, only broken in two.
 */
export function priceParts(price: string | null): { value: string; note: string | null } | null {
  if (!price) return null
  const m = price.match(/^\s*(.+?)\s+(per\s+.+?)\s*$/i)
  if (m) return { value: m[1]!.trim(), note: m[2]!.trim() }
  const t = price.trim()
  return t ? { value: t, note: null } : null
}

/**
 * A one-line description. Third parties publish one in the registry; Marque's
 * own reference agents carry theirs in-repo. Never generated, never padded.
 */
export function describe(a: MarketRow): string | null {
  const own = a.identity.description?.trim()
  if (own) return own
  if (a.isReference) return referenceAgent(a.agentId)?.blurb ?? null
  return null
}

/** "just now" / "6m ago" / "2h ago" from the API's generatedAt. */
export function measuredAgo(generatedAt: string | null): string | null {
  if (!generatedAt) return null
  const t = Date.parse(generatedAt)
  if (Number.isNaN(t)) return null
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}
