/**
 * Result Lens normaliser (SPEC-WORKSPACE 2.1): an agent's delivered answer, in whatever shape it
 * chose, read into one shape per category so it can be drawn and checked. Pure (no I/O): shared by
 * the Job Room renderer and the server checks.
 *
 * Every value here is the agent's own claim. A field Marque cannot find stays null and is drawn as
 * "not given"; nothing is inferred, estimated or filled in. Unrecognised answers become an outline
 * of what was delivered, never raw JSON first.
 */

type J = Record<string, unknown>
const isObj = (v: unknown): v is J => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v.trim()) ? Number(v) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const arr = (v: unknown): J[] => (Array.isArray(v) ? v.filter(isObj) : [])

/** First value found under any of these keys, searched breadth-first through the answer (depth 4). */
function pick(root: J, keys: string[], depth = 4): unknown {
  const want = new Set(keys.map((k) => k.toLowerCase().replace(/[_-]/g, '')))
  let level: J[] = [root]
  for (let d = 0; d <= depth && level.length; d++) {
    const next: J[] = []
    for (const o of level) {
      for (const [k, v] of Object.entries(o)) if (want.has(k.toLowerCase().replace(/[_-]/g, '')) && v !== null && v !== undefined) return v
      for (const v of Object.values(o)) if (isObj(v)) next.push(v)
    }
    level = next
  }
  return undefined
}

export interface LensMeta {
  block: string | null
  readAt: string | null
  source: string | null
  method: string | null
  assumptions: string[]
  limitations: string[]
  note: string | null
}

export interface HfLens { kind: 'health_factor'; account: string | null; hasPosition: boolean | null; healthFactor: number | null; target: number | null; repayUsd: number | null; collateralSymbol: string | null; collateralFactor: number | null; liquidationPriceUsd: number | null; markets: Array<{ symbol: string; suppliedUsd: number | null; borrowedUsd: number | null; priceUsd: number | null; liquidationPriceUsd: number | null; threshold: number | null }> }
export interface RebPosition { id: string | null; pair: string | null; feeTier: number | null; tickSpacing: number | null; current: number | null; range: [number, number] | null; inRange: boolean | null; proposed: [number, number] | null; amount0: number | null; amount1: number | null; slippageBps: number | null; note: string | null; closed: boolean | null }
export interface RebLens { kind: 'rebalancing'; owner: string | null; positions: RebPosition[] }
export interface GridLens {
  kind: 'grid'; pair: string | null; price: number | null; spacing: string | null
  levels: Array<{ price: number; allocationUsd: number | null; side: 'buy' | 'sell' | null }>
  lower: number | null; upper: number | null; stop: number | null; capitalUsd: number | null; feeDragPct: number | null; signal: string | null
  record: { fills: number | null; pnlUsd: number | null; gasUsd: number | null; window: string | null; roundTrips?: number | null; winRate?: number | null; maxDrawdownUsd?: number | null; source?: string | null; verify?: string | null } | null
  /** A standing grid stated as a policy (anchor, step, levels each side, clip) rather than a list of orders. */
  policy?: { anchorUsd: number | null; stepBps: number | null; levelsEachSide: number | null; clip: string | null; updatedAt: string | null } | null
  /** Its own executed fills, each with its transaction. */
  fills?: Array<{ at: string | null; side: 'buy' | 'sell' | null; base: number | null; quote: number | null; price: number | null; tx: string | null }>
}
export interface YieldLens { kind: 'yield'; recommend: boolean | null; venue: string | null; asset: string | null; netAprPct: number | null; grossAprPct: number | null; sizeUsd: number | null; sources: Array<{ value: number | null; label: string }>; switching: { gasUsd: number | null; swapUsd: number | null; exitUsd: number | null }; breakEvenUsd: number | null; improvementBps: number | null; declineReason: string | null; alternatives: Array<{ venue: string; netAprPct: number | null }>; excluded: Array<{ name: string; reason: string }> }
export interface SecurityLens { kind: 'security'; subject: string | null; symbol: string | null; verdict: string | null; findings: Array<{ severity: string; title: string; detail: string | null }>; counts: Record<string, number> | null; proxy: boolean | null; owner: string | null }
export interface GenericLens { kind: 'generic' }
export type LensBody = HfLens | RebLens | GridLens | YieldLens | SecurityLens | GenericLens
export type Lens = LensBody & { meta: LensMeta; error: string | null }

function meta(c: J): LensMeta {
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])
  return {
    block: str(pick(c, ['blockNumber', 'block', 'block_number', 'atBlock'], 2)),
    readAt: str(pick(c, ['readAt', 'read_at', 'measured_at', 'produced_at', 'timestamp'], 2)),
    source: str(pick(c, ['source'], 1)),
    method: str(pick(c, ['method'], 1)),
    assumptions: strings(pick(c, ['assumptions'], 2)),
    limitations: strings(pick(c, ['limitations'], 2)),
    note: str(pick(c, ['note', 'summary', 'verdict_text'], 3)),
  }
}

/** The answer with common envelopes removed: {answer}, {result}, {data}, {output}. */
export function unwrapAnswer(content: unknown): J | null {
  if (!isObj(content)) return null
  let c: J = content
  for (let i = 0; i < 3; i++) {
    const inner = ['answer', 'result', 'output', 'data'].map((k) => c[k]).find(isObj)
    if (!inner) break
    c = { ...c, ...inner }
  }
  return c
}

function healthFactor(c: J): HfLens {
  const markets = arr(pick(c, ['markets', 'positions', 'assets'])).map((m) => ({
    symbol: str(pick(m, ['underlyingSymbol', 'symbol', 'asset', 'market'], 1)) ?? '?',
    suppliedUsd: num(pick(m, ['suppliedUsd', 'supplyUsd', 'collateralUsd', 'supplied_usd'], 1)),
    borrowedUsd: num(pick(m, ['borrowedUsd', 'borrowUsd', 'debtUsd', 'borrowed_usd'], 1)),
    priceUsd: num(pick(m, ['priceUsd', 'price', 'price_usd'], 1)),
    liquidationPriceUsd: num(pick(m, ['liquidationPriceUsd', 'liquidationPrice', 'liquidation_price_usd'], 1)),
    threshold: num(pick(m, ['liquidationThreshold', 'collateralFactor', 'liquidation_threshold', 'collateral_factor'], 1)),
  }))
  return {
    kind: 'health_factor',
    account: str(pick(c, ['account', 'address', 'borrower', 'subject'])),
    hasPosition: bool(pick(c, ['hasPosition', 'has_position'])),
    healthFactor: num(pick(c, ['healthFactor', 'health_factor', 'hf'])),
    target: num(pick(c, ['targetHealthFactor', 'target_health_factor', 'targetHf', 'target'])),
    repayUsd: num(pick(c, ['repayUsdToReachTarget', 'repayUsd', 'repay_usd', 'repayAmountUsd', 'repay'])),
    collateralSymbol: str(pick(c, ['primaryCollateralSymbol', 'collateralSymbol', 'primary_collateral'])),
    collateralFactor: num(pick(c, ['primaryCollateralFactor', 'liquidationThreshold', 'collateralFactor'])),
    liquidationPriceUsd: num(pick(c, ['primaryLiquidationPriceUsd', 'liquidationPriceUsd', 'liquidation_price_usd', 'liquidationPrice'])),
    markets: markets.filter((m) => m.symbol !== '?' || m.suppliedUsd !== null || m.borrowedUsd !== null),
  }
}

const pair2 = (v: unknown): [number, number] | null => {
  if (Array.isArray(v) && v.length === 2 && v.every((x) => num(x) !== null)) { const a = num(v[0])!, b = num(v[1])!; return a <= b ? [a, b] : [b, a] }
  return null
}

function rebPosition(p: J): RebPosition {
  const plan = isObj(p['plan']) ? (p['plan'] as J) : isObj(p['proposal']) ? (p['proposal'] as J) : p
  const range = pair2(p['range']) ?? (num(p['tickLower']) !== null && num(p['tickUpper']) !== null ? [num(p['tickLower'])!, num(p['tickUpper'])!] as [number, number] : null)
  const proposed = pair2(plan['range']) ?? (num(plan['lower'] ?? plan['proposedTickLower']) !== null && num(plan['upper'] ?? plan['proposedTickUpper']) !== null
    ? [num(plan['lower'] ?? plan['proposedTickLower'])!, num(plan['upper'] ?? plan['proposedTickUpper'])!] as [number, number] : null)
  const fee = num(p['feeTier'] ?? p['fee'])
  const pairStr = str(p['pair'])
  const feeFromPair = pairStr?.match(/([\d.]+)%/)?.[1]
  return {
    id: str(p['position'] ?? p['tokenId'] ?? p['id']),
    pair: pairStr,
    feeTier: fee ?? (feeFromPair ? Math.round(Number(feeFromPair) * 10_000) : null),
    tickSpacing: num(p['tickSpacing']),
    current: num(p['currentTick'] ?? p['tick'] ?? plan['tick']),
    range,
    inRange: bool(p['inRange'] ?? p['in_range']),
    proposed,
    amount0: num(p['amount0'] ?? plan['amount0']),
    amount1: num(p['amount1'] ?? plan['amount1']),
    slippageBps: num(p['maxSlippageBps'] ?? p['slippageBps'] ?? plan['maxSlippageBps']),
    note: str(plan['note'] ?? p['note']),
    closed: bool(p['closed']),
  }
}

function rebalancing(c: J): RebLens {
  const list = arr(pick(c, ['positions']))
  const positions = list.length ? list.map(rebPosition) : (num(pick(c, ['currentTick', 'proposedTickLower'])) !== null ? [rebPosition(c)] : [])
  return { kind: 'rebalancing', owner: str(pick(c, ['owner', 'wallet', 'subject'])), positions }
}

function grid(c: J): GridLens {
  const levels = arr(pick(c, ['levels', 'grid', 'orders'])).map((l) => ({
    price: num(l['price'] ?? l['level'] ?? l['priceUsd']) ?? NaN,
    allocationUsd: num(l['allocationUsd'] ?? l['sizeUsd'] ?? l['usd'] ?? l['amountUsd']),
    side: ((): 'buy' | 'sell' | null => { const s = str(l['side'])?.toLowerCase(); return s === 'buy' || s === 'sell' ? s : null })(),
  })).filter((l) => Number.isFinite(l.price))
  const win = isObj(pick(c, ['window'])) ? (pick(c, ['window']) as J) : null
  const pol = isObj(pick(c, ['policy'])) ? (pick(c, ['policy']) as J) : null
  // A policy-stated grid (anchor, step in bps, N levels each side) gives its levels by arithmetic; stated, not invented.
  const anchor = pol ? num(pol['anchorUsd'] ?? pol['anchor']) : null, step = pol ? num(pol['stepBps']) : null, each = pol ? num(pol['levels']) : null
  if (!levels.length && anchor !== null && step !== null && each !== null && each > 0 && each <= 50) {
    for (let k = -each; k <= each; k++) if (k !== 0) levels.push({ price: anchor * (1 + (k * step) / 10_000), allocationUsd: null, side: k < 0 ? 'buy' : 'sell' })
  }
  return {
    kind: 'grid',
    pair: str(pick(c, ['pair', 'symbol', 'market'])),
    price: num(pick(c, ['currentPrice', 'price', 'priceUsdtPerBnb', 'spot', 'mid'])),
    spacing: str(pick(c, ['spacingType', 'spacing'])),
    levels: levels.sort((a, b) => a.price - b.price),
    lower: num(pick(c, ['lowerBound', 'lower', 'lowerPrice', 'lowerUsd'])),
    upper: num(pick(c, ['upperBound', 'upper', 'upperPrice', 'upperUsd'])),
    stop: num(pick(c, ['stopPrice', 'stop', 'stopLoss'])),
    capitalUsd: num(pick(c, ['capitalUsd', 'capital', 'totalUsd'])),
    feeDragPct: num(pick(c, ['feeDragPct', 'feeDrag', 'fee_drag_pct'])),
    signal: str(pick(c, ['signal', 'action'])),
    record: win ? {
      fills: num(win['fills']), pnlUsd: num(win['pnlUsd']), gasUsd: num(win['gasUsd']), window: [str(win['start']), str(win['end'])].filter(Boolean).join(' to ') || null,
      roundTrips: num(win['roundTrips']), winRate: num(win['winRate']), maxDrawdownUsd: num(win['maxDrawdownUsd']), source: str(win['source']), verify: str(win['verify']),
    } : null,
    policy: pol ? { anchorUsd: num(pol['anchorUsd'] ?? pol['anchor']), stepBps: num(pol['stepBps']), levelsEachSide: num(pol['levels']), clip: str(pol['clipWbnb'] ?? pol['clip'] ?? pol['size']), updatedAt: str(pol['stateUpdatedAt'] ?? pol['updatedAt']) } : null,
    fills: arr(pick(c, ['fills', 'trades', 'executions'])).slice(0, 50).map((f) => ({
      at: str(f['at'] ?? f['time'] ?? f['timestamp']),
      side: ((): 'buy' | 'sell' | null => { const v = str(f['side'])?.toLowerCase(); return v === 'buy' || v === 'sell' ? v : null })(),
      base: num(f['wbnb'] ?? f['base'] ?? f['amount']), quote: num(f['usdt'] ?? f['quote'] ?? f['usd']), price: num(f['price']), tx: str(f['tx'] ?? f['txHash'] ?? f['hash']),
    })),
  }
}

function yieldLens(c: J): YieldLens {
  const sw = isObj(pick(c, ['switchingCost', 'switching_cost', 'costs'])) ? (pick(c, ['switchingCost', 'switching_cost', 'costs']) as J) : {}
  const venueList = arr(pick(c, ['alternatives', 'ranking', 'venues', 'markets']))
  return {
    kind: 'yield',
    recommend: bool(pick(c, ['recommend', 'recommended'])),
    venue: str(pick(c, ['venue', 'recommendedVenue', 'best'])),
    asset: str(pick(c, ['asset', 'token', 'stable'])),
    netAprPct: num(pick(c, ['netAprPct', 'netApr', 'net_apr_pct', 'netApyPct'])),
    grossAprPct: num(pick(c, ['grossAprPct', 'grossApr', 'aprPct', 'supplyApyPct', 'apy'])),
    sizeUsd: num(pick(c, ['sizeUsd', 'amountUsd', 'size'])),
    sources: arr(pick(c, ['aprSources', 'sources'])).map((s) => ({ value: num(s['value']), label: str(s['source'] ?? s['label']) ?? 'source not stated' })),
    switching: { gasUsd: num(sw['gasUsd']), swapUsd: num(sw['swapUsd']), exitUsd: num(sw['exitUsd']) },
    breakEvenUsd: num(pick(c, ['breakEvenUsd', 'break_even_usd'])),
    improvementBps: num(pick(c, ['improvementBps'])),
    declineReason: str(pick(c, ['declineReason', 'decline_reason', 'reason'])),
    alternatives: venueList.map((v) => ({ venue: str(v['venue'] ?? v['name'] ?? v['symbol'] ?? v['market']) ?? '?', netAprPct: num(v['netAprPct'] ?? v['apyPct'] ?? v['supplyApyPct'] ?? v['apy'] ?? v['apr']) })).filter((v) => v.venue !== '?'),
    excluded: arr(pick(c, ['excluded'])).map((e) => ({ name: str(e['symbol'] ?? e['venue'] ?? e['name']) ?? '?', reason: str(e['detail'] ?? e['reason']) ?? '' })),
  }
}

function security(c: J): SecurityLens {
  const counts = isObj(pick(c, ['severityCounts'])) ? Object.fromEntries(Object.entries(pick(c, ['severityCounts']) as J).map(([k, v]) => [k, num(v) ?? 0])) : null
  const proxy = pick(c, ['proxy'])
  return {
    kind: 'security',
    subject: str(pick(c, ['address', 'token', 'contract', 'subject'])),
    symbol: str(pick(c, ['symbol'])),
    verdict: str(pick(c, ['verdict', 'summary'])),
    findings: arr(pick(c, ['findings', 'issues', 'risks'])).map((f) => ({ severity: (str(f['severity'] ?? f['level']) ?? 'info').toLowerCase(), title: str(f['title'] ?? f['name'] ?? f['id'] ?? f['selector']) ?? 'Finding', detail: str(f['detail'] ?? f['description'] ?? f['why']) })),
    counts,
    proxy: isObj(proxy) ? bool(proxy['isProxy']) : bool(proxy),
    owner: str(pick(c, ['owner'], 1)),
  }
}

/** Read a delivered answer for its category. `content` is the parsed response.content (or the document). */
export function normalizeAnswer(category: string | null, content: unknown): Lens {
  const c = unwrapAnswer(content)
  if (!c) return { kind: 'generic', meta: meta({}), error: null }
  const error = str(c['error'] ?? (isObj(c['error']) ? (c['error'] as J)['message'] : null))
  const m = meta(c)
  const has = (keys: string[]) => pick(c, keys) !== undefined
  const cat = category && ['health_factor', 'rebalancing', 'grid', 'yield', 'security'].includes(category) ? category
    // A health factor answer for an account with no borrowing carries healthFactor: null, so its other fields count too.
    : has(['healthFactor', 'health_factor']) || 'healthFactor' in c || has(['repayUsdToReachTarget', 'healthFactorExact', 'distanceToLiquidationPct']) ? 'health_factor' : has(['proposedTickLower', 'positions']) ? 'rebalancing'
      : has(['levels']) ? 'grid' : has(['netAprPct', 'aprSources']) ? 'yield' : has(['findings', 'severityCounts']) ? 'security' : null
  switch (cat) {
    case 'health_factor': return { ...healthFactor(c), meta: m, error }
    case 'rebalancing': return { ...rebalancing(c), meta: m, error }
    case 'grid': return { ...grid(c), meta: m, error }
    case 'yield': return { ...yieldLens(c), meta: m, error }
    case 'security': return { ...security(c), meta: m, error }
    default: return { kind: 'generic', meta: m, error }
  }
}

/** PancakeSwap V3 tick spacing per fee tier (in hundredths of a basis point). */
export const TICK_SPACING: Record<number, number> = { 100: 1, 500: 10, 2500: 50, 10000: 200 }
