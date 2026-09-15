/**
 * Marketplace state <-> URL.
 *
 * Every discovery control lives in one object so a market view can be copied,
 * shared, refreshed and stepped through with back/forward. Only values that
 * differ from the default are serialised, so a plain /register stays a plain
 * /register and a shared link carries exactly the state it describes.
 *
 * The query keys are deliberately the SAME names the marketplace API already
 * takes (`q`, `live`, `warranted`, `thirdParty`, `hasPrice`, `iface`, `sort`,
 * `category`) plus two display-only keys (`page`, `view`, `rows`). Nothing here
 * changes backend query semantics — it only records the choices the user made.
 */

export type MarketView = 'list' | 'grid'

export interface MarketState {
  search: string
  category: string | null
  sort: string
  liveNow: boolean
  warranted: boolean
  thirdParty: boolean
  hasPrice: boolean
  iface: string | null
  page: number
  pageSize: number
  view: MarketView
}

export const DEFAULT_STATE: MarketState = {
  search: '',
  category: null,
  sort: 'best',
  liveNow: false,
  warranted: false,
  thirdParty: false,
  hasPrice: false,
  iface: null,
  page: 0,
  pageSize: 15,
  view: 'list',
}

const PAGE_SIZES = [10, 15, 20]
const SORT_VALUES = ['best', 'proven', 'price', 'fast', 'recent']
const IFACE_VALUES = ['a2a', 'mcp', 'x402', 'erc8183']
const CATEGORY_VALUES = ['rebalancing', 'grid', 'yield', 'health_factor', 'security']

/**
 * The query string the marketplace API is called with. Unchanged from the
 * original implementation, byte for byte — this is the contract, not a place to
 * be creative. `page`/`view`/`rows` never reach it.
 */
export function apiQuery(s: MarketState): string {
  const p = new URLSearchParams()
  if (s.category) p.set('category', s.category)
  if (s.search.trim()) p.set('q', s.search.trim())
  if (s.sort !== 'best') p.set('sort', s.sort)
  if (s.liveNow) p.set('live', '1')
  if (s.warranted) p.set('warranted', '1')
  if (s.thirdParty) p.set('thirdParty', '1')
  if (s.hasPrice) p.set('hasPrice', '1')
  if (s.iface) p.set('iface', s.iface)
  return p.toString()
}

/** Only the non-default values, in a stable order, for the address bar. */
export function stateToParams(s: MarketState, opts: { fixedCategory?: boolean } = {}): string {
  const p = new URLSearchParams()
  if (s.search.trim()) p.set('q', s.search.trim())
  // On /register/[category] the route already names the category; repeating it
  // in the query would let the two disagree.
  if (!opts.fixedCategory && s.category) p.set('category', s.category)
  if (s.sort !== DEFAULT_STATE.sort) p.set('sort', s.sort)
  if (s.liveNow) p.set('live', '1')
  if (s.warranted) p.set('warranted', '1')
  if (s.thirdParty) p.set('thirdParty', '1')
  if (s.hasPrice) p.set('hasPrice', '1')
  if (s.iface) p.set('iface', s.iface)
  if (s.view !== DEFAULT_STATE.view) p.set('view', s.view)
  if (s.pageSize !== DEFAULT_STATE.pageSize) p.set('rows', String(s.pageSize))
  if (s.page > 0) p.set('page', String(s.page + 1))
  return p.toString()
}

const isOn = (v: string | null) => v === '1' || v === 'true'

/**
 * Read a URL back into state. Anything unrecognised is ignored rather than
 * trusted — a hand-edited link can never push an unsupported value at the API.
 */
export function paramsToState(
  search: string,
  base: MarketState,
  opts: { fixedCategory?: string | null } = {},
): MarketState {
  const p = new URLSearchParams(search)
  const has = (k: string) => p.has(k)

  const rawSort = p.get('sort')
  const rawIface = p.get('iface')
  const rawCategory = p.get('category')
  const rawView = p.get('view')
  const rawRows = Number(p.get('rows'))
  const rawPage = Number(p.get('page'))

  return {
    search: p.get('q') ?? '',
    category: opts.fixedCategory
      ? opts.fixedCategory
      : rawCategory && CATEGORY_VALUES.includes(rawCategory)
        ? rawCategory
        : null,
    sort: rawSort && SORT_VALUES.includes(rawSort) ? rawSort : DEFAULT_STATE.sort,
    liveNow: isOn(p.get('live')),
    warranted: isOn(p.get('warranted')),
    thirdParty: isOn(p.get('thirdParty')),
    hasPrice: isOn(p.get('hasPrice')),
    iface: rawIface && IFACE_VALUES.includes(rawIface) ? rawIface : null,
    // A view in the URL wins; otherwise keep whatever the caller had (which is
    // the remembered preference on first mount).
    view: rawView === 'grid' || rawView === 'list' ? rawView : has('view') ? DEFAULT_STATE.view : base.view,
    pageSize: PAGE_SIZES.includes(rawRows) ? rawRows : DEFAULT_STATE.pageSize,
    page: Number.isFinite(rawPage) && rawPage > 1 ? Math.floor(rawPage) - 1 : 0,
  }
}

/** Which filters are on, as dismissible chips. Display only. */
export interface ActiveFilter {
  key: keyof MarketState
  label: string
  clear: Partial<MarketState>
}

export function activeFilters(s: MarketState, ifaceLabel: (v: string) => string): ActiveFilter[] {
  const out: ActiveFilter[] = []
  if (s.liveNow) out.push({ key: 'liveNow', label: 'Live now', clear: { liveNow: false } })
  if (s.warranted) out.push({ key: 'warranted', label: 'Qualified', clear: { warranted: false } })
  if (s.thirdParty) out.push({ key: 'thirdParty', label: 'Third-party only', clear: { thirdParty: false } })
  if (s.hasPrice) out.push({ key: 'hasPrice', label: 'Price listed', clear: { hasPrice: false } })
  if (s.iface) out.push({ key: 'iface', label: ifaceLabel(s.iface), clear: { iface: null } })
  return out
}

export const CLEARED_FILTERS: Partial<MarketState> = {
  liveNow: false,
  warranted: false,
  thirdParty: false,
  hasPrice: false,
  iface: null,
}

/** The view preference is a convenience, so a failed read must never break the page. */
const VIEW_KEY = 'marque.market.view'
export function readStoredView(): MarketView | null {
  try {
    const v = window.localStorage.getItem(VIEW_KEY)
    return v === 'grid' || v === 'list' ? v : null
  } catch {
    return null
  }
}
export function storeView(v: MarketView): void {
  try {
    window.localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* private mode, blocked storage — the preference simply does not persist */
  }
}
