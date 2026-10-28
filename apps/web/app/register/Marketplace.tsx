'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { EmptyState, Limits } from '@marque/ui'
import type { FailedGroupRow, InitialMarket, MarketFacetCounts } from './initial'
import { track } from '../../lib/track'
import { MarketToolbar } from './MarketToolbar'
import { LaneSwitch } from './LaneSwitch'
import { MarketList } from './MarketList'
import { RegisterTable } from './RegisterTable'
import { AgentCard } from '../_components/market/AgentCard'
import { AgentAvatar } from '../_components/AgentAvatar'
import { Sheet } from '../_components/ui'
import { CompareTable } from '../compare/CompareTable'
import { UNote } from '../_components/ui/UNote'
import { TABS, hireHref, ifaceLabel, measuredAgo, type MarketRow, type MarketTab } from './market-model'
import {
  activeFilters,
  apiQuery,
  CLEARED_FILTERS,
  DEFAULT_STATE,
  paramsToState,
  readStoredView,
  stateToParams,
  storeView,
  type MarketState,
} from './market-url'
import styles from './register.module.css'
import { expireMarketQuote } from '../../lib/quote-expiry'
import { canReuseInitialMarket } from './initial-freshness'
import { readLocalPrefs } from '../../lib/profile-client'

/**
 * The marketplace.
 *
 * Everything about how this talks to the server is unchanged: the same
 * `/api/v1/marketplace` call, the same debounce, the same query keys, the same
 * qualification ordering, the same pagination, the same compare rules, the same
 * telemetry. What changed is the order a human meets it in — controls and
 * inventory first, methodology one layer down — and that the whole market view
 * now lives in the URL so it can be shared and stepped through.
 */
export function Marketplace({ category: fixedCategory, initial }: { category?: string; initial?: InitialMarket | null }) {
  // The server rendered the default view's first page: it is on screen at first paint,
  // and the first fetch is skipped only while that matching view is still fresh.
  const [rows, setRows] = useState<MarketRow[]>(initial?.agents ?? [])
  useEffect(() => {
    const current = rows.map(row => expireMarketQuote(row))
    if (current.some((row, i) => row !== rows[i])) { setRows(current); return }
    const deadlines = rows.filter(row => ['hireable', 'settleable'].includes(row.commerce.state))
      .map(row => Date.parse(row.commerce.quoteExpiresAt ?? '')).filter(Number.isFinite)
    if (!deadlines.length) return
    const timer = setTimeout(() => setRows(previous => previous.map(row => expireMarketQuote(row))), Math.min(2_147_483_647, Math.max(0, Math.min(...deadlines) - Date.now()) + 5))
    return () => clearTimeout(timer)
  }, [rows])
  const [loading, setLoading] = useState(!initial)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(initial?.generatedAt ?? null)
  const [total, setTotal] = useState<number | null>(initial?.total ?? null)
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false)
  const [facets, setFacets] = useState<MarketFacetCounts | null>(initial?.facets ?? null)
  const [failedGroup, setFailedGroup] = useState<FailedGroupRow[]>(initial?.failedGroup ?? [])
  const seeded = useRef(initial?.key ?? null)
  const [retry, setRetry] = useState(0)
  const [rankInfo, setRankInfo] = useState(false)

  const [state, setState] = useState<MarketState>(() => ({
    ...DEFAULT_STATE,
    category: fixedCategory ?? null,
  }))
  /** Nothing fetches or writes the URL until the URL has been read once. */
  const [ready, setReady] = useState(false)
  const [, refreshMeasurementAge] = useState(0)
  const replaceNext = useRef(false)

  useEffect(() => {
    if (!ready) return
    const timer = setInterval(() => refreshMeasurementAge(age => age + 1), 30_000)
    return () => clearInterval(timer)
  }, [ready])

  const resultsId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const rowRects = useRef<Map<string, number>>(new Map())

  /* --- state in, state out ------------------------------------------- */

  const patch = useCallback((p: Partial<MarketState>) => {
    setState((s) => ({ ...s, ...p }))
  }, [])

  /** A change that alters the query returns the reader to the first page. */
  const patchFilter = useCallback((p: Partial<MarketState>) => {
    // Typing must not push a history entry per keystroke.
    if ('search' in p) replaceNext.current = true
    setState((s) => ({ ...s, ...p, page: 0 }))
  }, [])

  // Read the URL once on mount, ahead of the first fetch, so a shared link
  // never costs an extra request for the default view it is about to replace.
  useEffect(() => {
    const stored = readStoredView()
    // A profile's "Marketplace opens on" preference, only when the link names no network of its own.
    const lane = readLocalPrefs()?.lane
    const named = /[?&](lane|network)=/.test(window.location.search)
    if (lane && lane !== 'all' && !named) replaceNext.current = true
    setState((s) => {
      const next = paramsToState(window.location.search, stored ? { ...s, view: stored } : s, { fixedCategory: fixedCategory ?? null })
      return lane && lane !== 'all' && !named ? { ...next, lane } : next
    })
    setReady(true)
    // Mount only: fixedCategory is fixed by the route.
  }, [])

  useEffect(() => {
    if (!ready) return
    // The hire sheet lives in the URL (?hire=) over any page; filter sync must never drop it.
    const current = new URLSearchParams(window.location.search)
    const hire = current.get('hire')
    const params = new URLSearchParams(stateToParams(state, { fixedCategory: !!fixedCategory }))
    if (hire) {
      params.set('hire', hire)
      for (const key of ['serviceId', 'try']) {
        const value = current.get(key)
        if (value !== null) params.set(key, value)
      }
    }
    const qs = params.toString()
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    if (next === window.location.pathname + window.location.search) return
    if (replaceNext.current) {
      window.history.replaceState(null, '', next)
      replaceNext.current = false
    } else {
      window.history.pushState(null, '', next)
    }
    // The header pill reads the lane from the address; tell it the address changed.
    window.dispatchEvent(new Event('marque:lane'))
  }, [state, ready, fixedCategory])

  useEffect(() => {
    const onPop = () =>
      setState((s) => paramsToState(window.location.search, s, { fixedCategory: fixedCategory ?? null }))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [fixedCategory])

  // Remember a view only once the buyer changes it; the default is never written.
  const viewAtLoad = useRef<string | null>(null)
  useEffect(() => {
    if (!ready) return
    if (viewAtLoad.current === null) { viewAtLoad.current = state.view; return }
    if (state.view !== viewAtLoad.current) { storeView(state.view); viewAtLoad.current = state.view }
  }, [state.view, ready])

  /* --- the fetch: unchanged contract ---------------------------------- */

  const qs = apiQuery(state)
  const { page, pageSize } = state

  useEffect(() => {
    if (!ready) return
    // The Registry tab is the graveyard table, which pages its own data.
    if (state.tab === 'registry') { setLoading(false); setError(null); return }
    const key = `${qs}|${page}|${pageSize}`
    if (seeded.current !== null) {
      const same = seeded.current === key
      seeded.current = null
      if (same && retry === 0 && canReuseInitialMarket(initial?.generatedAt)) return
    }
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setTotal(null)
    setGeneratedAt(null)
    setHasMore(false)
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/v1/marketplace?${qs}&limit=${pageSize}&offset=${page * pageSize}`, {
            cache: 'no-store',
            signal: controller.signal,
          })
          const j = await res.json()
          if (cancelled) return
          if (!res.ok) {
            setError(j.detail ?? j.error ?? 'Could not load the marketplace.')
            setRows([])
          } else {
            setRows(j.agents ?? [])
            setTotal(typeof j.total === 'number' ? j.total : null)
            setHasMore(j.hasMore === true)
            setFacets(j.facets ?? null)
            setFailedGroup(Array.isArray(j.failedGroup) ? j.failedGroup : [])
            // The API clamps an out-of-range offset; follow it rather than
            // showing page 9 of 3.
            if (typeof j.offset === 'number' && j.offset !== page * pageSize) {
              setState((s) => ({ ...s, page: Math.floor(j.offset / s.pageSize) }))
            }
            setGeneratedAt(j.generatedAt ?? null)
            const q = state.search.trim()
            if (q.length >= 2) track('marketplace_search', { q: q.length })
          }
        } catch (err) {
          if (!cancelled && (err as Error)?.name !== 'AbortError') setError('Could not reach the marketplace.')
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, 180)
    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(t)
    }
  }, [qs, page, pageSize, ready, retry, state.tab, initial?.generatedAt])

  /* --- FLIP: remember row positions, animate the delta ---------------- */

  // Switching view relocates every row; that is a layout change, not a
  // reorder, so the remembered positions are dropped rather than animated.
  useEffect(() => {
    rowRects.current = new Map()
  }, [state.view])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const next = new Map<string, number>()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.querySelectorAll<HTMLElement>('[data-agent]').forEach((n) => {
      const id = n.dataset.agent!
      const top = n.getBoundingClientRect().top
      const prev = rowRects.current.get(id)
      if (prev !== undefined && Math.abs(prev - top) > 1 && !reduced) {
        n.animate(
          [{ transform: `translateY(${prev - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' },
        )
      }
      next.set(id, top)
    })
    rowRects.current = next
  }, [rows, state.view])

  /* --- compare: at most three, unchanged ------------------------------ */

  const [selected, setSelected] = useState<MarketRow[]>([])
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.agentId)), [selected])

  const toggleSelect = useCallback((r: MarketRow) => {
    setSelected((cur) => {
      if (cur.some((x) => x.agentId === r.agentId)) return cur.filter((x) => x.agentId !== r.agentId)
      if (cur.length >= 3) return cur
      queueMicrotask(() => track('compare_add', r.category ? { category: r.category } : undefined))
      return [...cur, r]
    })
  }, [])

  const compareHref = `/compare?agents=${selected.map((s) => encodeURIComponent(s.agentId)).join(',')}`
  // Compare opens over the marketplace (29 Sep): the rows are already here, so the sheet
  // is instant and closing it returns to the same scroll and filters. /compare stays as
  // the shareable page.
  const [comparing, setComparing] = useState(false)
  useEffect(() => { if (selected.length < 2) setComparing(false) }, [selected.length])

  /* --- derived display ------------------------------------------------ */

  const chips = activeFilters(state, ifaceLabel)
  const ago = measuredAgo(generatedAt)
  const changePage = (next: number) => {
    setState((s) => ({ ...s, page: next }))
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }
  const skeletonCount = Math.min(pageSize, state.view === 'grid' ? 8 : 6)

  const tabHint = TABS.find((t) => t.value === state.tab)?.hint
  const pickTab = (t: MarketTab) => patchFilter({ tab: t })

  return (
    <>
      <LaneSwitch lane={state.lane} onPick={(l) => patchFilter({ lane: l })} />
      {state.lane === 'practice' ? <p className={styles.laneBanner}>BSC testnet · test tokens, no real value. Practice hires count for Set and Earn.</p> : null}
      <div className={styles.marketTabs} role="tablist" aria-label="What to show">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={state.tab === t.value}
            aria-controls={resultsId}
            className={styles.marketTab}
            onClick={() => pickTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabHint ? <p className={styles.marketTabHint}>{tabHint}.</p> : null}

      {state.tab === 'registry' ? (
        <div id={resultsId} className={styles.results}>
          <RegisterTable graveyard />
        </div>
      ) : (
      <>
      <MarketToolbar
        state={state}
        patch={patch}
        patchFilter={patchFilter}
        fixedCategory={fixedCategory}
        resultsId={resultsId}
        facets={facets}
        total={total}
      />

      {/* Result utility bar: what this set is, and how it was ranked. */}
      <UNote className={styles.uNote} />
      <div className={styles.utility}>
        <p className={styles.utilityCount} role="status" aria-live="polite">
          {!ready || total === null ? (
            loading || !ready ? 'Counting agents…' : 'Result count unavailable'
          ) : (
            <>
              <strong>{total.toLocaleString()}</strong> {total === 1 ? 'agent' : 'agents'}
            </>
          )}
          {ready && ago && <span className={styles.utilityDot}> · Measured {ago}</span>}
          <span className={styles.utilityDot}> · Operator-deduplicated</span>
          {state.tab === 'ready' ? <span className={styles.utilityDot}> · Passed their test first, then untested, then failed; each result on its card</span> : null}
        </p>
        <button
          type="button"
          className={styles.utilityInfo}
          aria-expanded={rankInfo}
          onClick={() => setRankInfo((v) => !v)}
        >
          Qualification-first ranking
          <span className={styles.utilityInfoMark} aria-hidden="true">i</span>
        </button>
      </div>

      {rankInfo && (
        <p className={styles.utilityNote}>
          Qualified agents rank first, then agents that were tested and did not qualify, then agents that are
          merely callable. Duplicate identities registered by the same operator against the same endpoint are
          grouped into one row. This owner/endpoint grouping is an inference; distinct addresses do not prove independent people or funding.
        </p>
      )}

      <p className={styles.trust}>
        <span className={styles.trustDot} aria-hidden="true" />
        <span>
          <b>Try free</b> runs Marque reference agents with no wallet.
        </span>
        <Link className={styles.trustLink} href="/standard">
          How Marque tests agents
        </Link>
      </p>
      <Limits className={styles.trustLimits}>
        <p>Try free is available for supported Marque reference services. Outside-agent task calls are not assumed free. No wallet or signature is needed for a supported preview.</p>
      </Limits>

      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" className={styles.retry} onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      <div id={resultsId} ref={listRef} className={styles.results}>
        <h2 className="sr-only">Agent results</h2>
        {loading && (
          <div className={state.view === 'grid' ? styles.grid : styles.list} aria-hidden="true">
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} className={state.view === 'grid' ? styles.cardSkel : styles.rowSkel}>
                <span className={styles.skelThumb} />
                <span className={styles.skelLines}>
                  <span className={styles.skelLine} />
                  <span className={`${styles.skelLine} ${styles.skelLineShort}`} />
                </span>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <EmptyState title="No agent matches these filters.">
            <p>
              This is the real count, not a loading state: Marque does not pad a category with agents that do
              not exist.
            </p>
            {state.category ? <p><a className="btn btn--sm" href={`/tender?category=${state.category}`}>Ask every {state.category.replace('_', ' ')} agent for a price instead</a></p> : null}
            {(chips.length > 0 || state.search.trim() || state.category) && (
              <p>
                <button
                  type="button"
                  className={styles.retry}
                  onClick={() =>
                    patchFilter({
                      ...CLEARED_FILTERS,
                      search: '',
                      ...(fixedCategory ? {} : { category: null }),
                    })
                  }
                >
                  Clear filters
                </button>
              </p>
            )}
          </EmptyState>
        )}

        {!loading && !error && rows.length > 0 &&
          (state.view === 'grid' ? (
            <div className={styles.cardGrid}>
              {rows.map((a) => (
                <AgentCard key={a.agentId} a={a} compare={{ picked: selectedIds.has(a.agentId), atLimit: selected.length >= 3, onToggle: toggleSelect }} />
              ))}
            </div>
          ) : (
            <MarketList rows={rows} selectedIds={selectedIds} atLimit={selected.length >= 3} onToggle={toggleSelect} />
          ))}
      </div>

      <nav className={styles.pagination} aria-label="Marketplace pages">
        <label className={styles.rowsPer}>
          Rows per page{' '}
          <select
            className={styles.sort}
            value={pageSize}
            onChange={(e) => setState((s) => ({ ...s, pageSize: Number(e.target.value), page: 0 }))}
          >
            {[10, 15, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className={styles.pageOf}>
          {loading
            ? 'Loading page…'
            : total === null
              ? 'Results unavailable'
              : total === 0
                ? 'No matching agents'
                : `${page * pageSize + 1} to ${page * pageSize + rows.length} of ${total.toLocaleString()}`}
        </span>
        <div className={styles.pageButtons}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={loading || page === 0}
            onClick={() => changePage(page - 1)}
          >
            Previous
          </button>
          <span className={styles.pageNum}>Page {page + 1}</span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={loading || !hasMore || !!error}
            onClick={() => changePage(page + 1)}
          >
            Next
          </button>
        </div>
      </nav>

      {state.tab === 'ready' && failedGroup.length ? (
        <details className={styles.failedGroup}>
          <summary><b>Listed, failed its latest test</b> <span>{failedGroup.length} {failedGroup.length === 1 ? 'agent' : 'agents'}, hireable but not counted above</span></summary>
          <p className={styles.failedNote}>These agents take paid jobs, but their answers did not pass Marque&apos;s published test for their category. They are listed so nothing is hidden; the Ready count above leaves them out.</p>
          <ul>
            {failedGroup.map((f) => (
              <li key={f.agentId}>
                <a href={f.agentId.startsWith('97:') ? `/agents/97/${f.agentId.split(':').pop()}` : `/agents/56/${f.agentId.split(':').pop()}`}>{f.name}</a>
                <span>{f.testId ? `Failed ${f.testId}` : 'Failed its test'}{f.failedField ? `: ${f.failedField.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} did not match` : ''}{f.date ? `, ${new Date(f.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      </>
      )}

      {selected.length >= 1 && (
        <div className={styles.tray} role="region" aria-label="Compare tray" data-compare-tray="">
          <span className={styles.traySlots}>
            {selected.map((s) => (
              <button key={s.agentId} type="button" className={styles.traySlot} onClick={() => toggleSelect(s)} aria-label={`Remove ${s.name} from comparison`} title={`Remove ${s.name}`}>
                <AgentAvatar id={s.agentId} name={s.name} category={s.category} reference={s.isReference} imageUrl={s.identity.imageUrl} size={34} />
                <span className={styles.trayX} aria-hidden="true">×</span>
              </button>
            ))}
            {Array.from({ length: Math.max(0, 3 - selected.length) }).map((_, i) => <span key={`e${i}`} className={styles.trayEmpty} aria-hidden="true" />)}
          </span>
          <span className={styles.trayText}>
            <span className={styles.trayTitle}>{selected.length === 1 ? <>Pick 1 more<span className={styles.trayWide}> to compare</span></> : <>{selected.length}<span className={styles.trayWide}> agents</span> selected</>}</span>
            <span className={styles.trayNames}>{selected.map((s) => s.name).join(', ')}</span>
          </span>
          <span className={styles.trayActions}>
            <button type="button" className={styles.trayClear} onClick={() => setSelected([])}>Clear</button>
            <button type="button" className="btn btn--sm btn--primary" disabled={selected.length < 2} onClick={() => setComparing(true)}>
              Compare{selected.length >= 2 ? ` ${selected.length}` : ''}
            </button>
          </span>
        </div>
      )}

      <Sheet
        open={comparing && selected.length >= 2}
        onClose={() => setComparing(false)}
        size="wide"
        label="Compare agents"
        title={<span className="t-h3">Comparing {selected.length} agents</span>}
        footer={
          <div className={styles.compareFoot}>
            <span>Green marks the strongest value in a row. Ratings come only from buyers who paid for a delivered job.</span>
            <Link href={compareHref} prefetch={false}>Open as a page</Link>
          </div>
        }
      >
        <CompareTable
          chosen={selected}
          hireLink={(a) => hireHref(a)}
          tryLink={(a) => `${hireHref(a)}&try=1`}
          onNavigate={() => setComparing(false)}
        />
      </Sheet>
    </>
  )
}
