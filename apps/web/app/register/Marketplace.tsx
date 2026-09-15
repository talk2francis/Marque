'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { EmptyState, LinkButton } from '@marque/ui'
import { track } from '../../lib/track'
import { MarketToolbar } from './MarketToolbar'
import { MarketList } from './MarketList'
import { MarketGrid } from './MarketGrid'
import { ifaceLabel, measuredAgo, type MarketRow } from './market-model'
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
export function Marketplace({ category: fixedCategory }: { category?: string }) {
  const [rows, setRows] = useState<MarketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [retry, setRetry] = useState(0)
  const [rankInfo, setRankInfo] = useState(false)

  const [state, setState] = useState<MarketState>(() => ({
    ...DEFAULT_STATE,
    category: fixedCategory ?? null,
  }))
  /** Nothing fetches or writes the URL until the URL has been read once. */
  const [ready, setReady] = useState(false)
  const replaceNext = useRef(false)

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
    setState((s) =>
      paramsToState(window.location.search, stored ? { ...s, view: stored } : s, {
        fixedCategory: fixedCategory ?? null,
      }),
    )
    setReady(true)
    // Mount only: fixedCategory is fixed by the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ready) return
    const qs = stateToParams(state, { fixedCategory: !!fixedCategory })
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    if (next === window.location.pathname + window.location.search) return
    if (replaceNext.current) {
      window.history.replaceState(null, '', next)
      replaceNext.current = false
    } else {
      window.history.pushState(null, '', next)
    }
  }, [state, ready, fixedCategory])

  useEffect(() => {
    const onPop = () =>
      setState((s) => paramsToState(window.location.search, s, { fixedCategory: fixedCategory ?? null }))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [fixedCategory])

  useEffect(() => {
    if (ready) storeView(state.view)
  }, [state.view, ready])

  /* --- the fetch: unchanged contract ---------------------------------- */

  const qs = apiQuery(state)
  const { page, pageSize } = state

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, page, pageSize, ready, retry])

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

  /* --- derived display ------------------------------------------------ */

  const chips = activeFilters(state, ifaceLabel)
  const ago = measuredAgo(generatedAt)
  const changePage = (next: number) => {
    setState((s) => ({ ...s, page: next }))
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }
  const skeletonCount = Math.min(pageSize, state.view === 'grid' ? 8 : 6)

  return (
    <>
      <MarketToolbar
        state={state}
        patch={patch}
        patchFilter={patchFilter}
        fixedCategory={fixedCategory}
        resultsId={resultsId}
      />

      {/* Result utility bar: what this set is, and how it was ranked. */}
      <div className={styles.utility}>
        <p className={styles.utilityCount} role="status" aria-live="polite">
          {total === null ? (
            loading ? 'Counting agents…' : 'Result count unavailable'
          ) : (
            <>
              <strong>{total.toLocaleString()}</strong> {total === 1 ? 'agent' : 'agents'}
            </>
          )}
          {ago && <span className={styles.utilityDot}> · Measured {ago}</span>}
          <span className={styles.utilityDot}> · Operator-deduplicated</span>
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
          grouped into one row, so a team that registered forty identities is one entry, not forty.
        </p>
      )}

      <p className={styles.trust}>
        <span className={styles.trustDot} aria-hidden="true" />
        <span>
          <b>Preview is free</b> — run a real task and see the result before you pay or grant authority.
        </span>
        <Link className={styles.trustLink} href="/standard">
          How qualification works →
        </Link>
      </p>

      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" className={styles.retry} onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      <div id={resultsId} ref={listRef} className={styles.results}>
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
              This is the real count, not a loading state — Marque does not pad a category with agents that do
              not exist.
            </p>
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
            <MarketGrid rows={rows} selectedIds={selectedIds} atLimit={selected.length >= 3} onToggle={toggleSelect} />
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
                : `${page * pageSize + 1}–${page * pageSize + rows.length} of ${total.toLocaleString()}`}
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

      {selected.length >= 1 && (
        <div className={styles.tray} role="region" aria-label="Compare tray">
          <span className={styles.trayLabel}>
            {selected.length === 1 ? 'Pick one more to compare' : `Comparing ${selected.length}`}
          </span>
          <span className={styles.trayList}>
            {selected.map((s) => (
              <span key={s.agentId} className={styles.trayChip}>
                {s.name}
                <button type="button" aria-label={`Remove ${s.name} from comparison`} onClick={() => toggleSelect(s)}>
                  ×
                </button>
              </span>
            ))}
          </span>
          <LinkButton
            variant="primary"
            size="sm"
            href={compareHref}
            {...(selected.length < 2
              ? { 'aria-disabled': true, tabIndex: -1, onClick: (e: React.MouseEvent) => e.preventDefault() }
              : {})}
          >
            Compare{selected.length >= 2 ? ` ${selected.length}` : ''}
          </LinkButton>
        </div>
      )}
    </>
  )
}
