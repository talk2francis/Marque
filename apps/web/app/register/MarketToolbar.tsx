'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CATEGORY_SLUG,
  PRIMARY_CATEGORIES,
  SORTS,
  SUPPLEMENTAL_CATEGORIES,
  ifaceLabel,
  type CategoryTab,
} from './market-model'
import { activeFilters, CLEARED_FILTERS, type MarketState } from './market-url'
import { MarketFilters } from './MarketFilters'
import styles from './register.module.css'

/**
 * The market's discovery surface: search, facets, sort, view, categories.
 *
 * It sticks under the site header so the controls stay reachable once a reader
 * is deep in results, but it sticks as a thin strip — the introduction scrolls
 * away, and the active-filter chips stay below the strip so the sticky slab
 * never grows tall enough to eat the inventory it exists to serve.
 */
export function MarketToolbar({
  state,
  patch,
  patchFilter,
  fixedCategory,
  resultsId,
}: {
  state: MarketState
  /** Display-only changes: does not reset the page. */
  patch: (p: Partial<MarketState>) => void
  /** Query-changing changes: resets to page 1. */
  patchFilter: (p: Partial<MarketState>) => void
  fixedCategory?: string
  resultsId: string
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const chips = activeFilters(state, ifaceLabel)

  // A sentinel above the bar is cheaper and steadier than a scroll listener.
  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setStuck(!(e?.isIntersecting ?? true)), { threshold: 1 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const tabs: CategoryTab[] = PRIMARY_CATEGORIES
  const isOn = (v: string | null) => (state.category ?? null) === v

  /**
   * On a category route the tabs are navigation — each sibling route owns its
   * own fixed category, so switching category means changing page. On /register
   * they stay client state, exactly as they always were.
   */
  const renderTab = (c: CategoryTab, supplemental = false) => {
    const cls = `${styles.tab} ${isOn(c.value) ? styles.tabOn : ''} ${supplemental ? styles.tabSupplemental : ''}`
    if (fixedCategory) {
      const href = c.value ? `/register/${CATEGORY_SLUG[c.value] ?? c.value}` : '/register'
      return (
        <Link key={c.label} href={href} className={cls} aria-current={isOn(c.value) ? 'page' : undefined}>
          {c.label}
        </Link>
      )
    }
    return (
      <button
        key={c.label}
        type="button"
        className={cls}
        aria-pressed={isOn(c.value)}
        onClick={() => patchFilter({ category: c.value })}
      >
        {c.label}
      </button>
    )
  }

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className={styles.stickySentinel} />
      <div className={styles.toolbarWrap} data-stuck={stuck || undefined}>
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" strokeLinecap="round" />
            </svg>
            <input
              className={styles.search}
              type="search"
              value={state.search}
              onChange={(e) => patchFilter({ search: e.target.value })}
              placeholder="Search agents, protocols or capabilities"
              aria-label="Search the marketplace"
              aria-controls={resultsId}
              spellCheck={false}
            />
          </div>

          <MarketFilters state={state} patch={patchFilter} activeCount={chips.length} />

          <label className={styles.sortWrap}>
            <span className={styles.sortLabel}>Sort</span>
            <select
              className={styles.sort}
              value={state.sort}
              onChange={(e) => patchFilter({ sort: e.target.value })}
              aria-label="Sort results"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <div className={styles.viewToggle} role="group" aria-label="Result layout">
            {(['list', 'grid'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`${styles.viewBtn} ${state.view === v ? styles.viewBtnOn : ''}`}
                aria-pressed={state.view === v}
                aria-label={v === 'list' ? 'List view' : 'Grid view'}
                title={v === 'list' ? 'List view' : 'Grid view'}
                onClick={() => patch({ view: v })}
              >
                {v === 'list' ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M2 4h12M2 8h12M2 12h12" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <rect x="2" y="2" width="5" height="5" rx="1" />
                    <rect x="9" y="2" width="5" height="5" rx="1" />
                    <rect x="2" y="9" width="5" height="5" rx="1" />
                    <rect x="9" y="9" width="5" height="5" rx="1" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.tabs} role="group" aria-label="Category">
          {tabs.map((c) => renderTab(c))}
          <span className={styles.tabDivider} aria-hidden="true" />
          {SUPPLEMENTAL_CATEGORIES.map((c) => renderTab(c, true))}
        </div>
      </div>

      {chips.length > 0 && (
        <div className={styles.chipRow}>
          <span className={styles.chipRowLabel}>Filtered by</span>
          {chips.map((c) => (
            <button
              key={String(c.key)}
              type="button"
              className={styles.activeChip}
              onClick={() => patchFilter(c.clear)}
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label}
              <span className={styles.activeChipX} aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className={styles.chipClear} onClick={() => patchFilter(CLEARED_FILTERS)}>
            Clear all
          </button>
        </div>
      )}
    </>
  )
}
