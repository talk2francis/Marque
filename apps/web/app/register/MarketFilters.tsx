'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IFACES } from './market-model'
import { CLEARED_FILTERS, type MarketState } from './market-url'
import type { MarketFacetCounts } from './initial'
import styles from './register.module.css'

/**
 * Faceted filtering without surrendering 300px of marketplace to a permanent
 * sidebar. One button opens an anchored panel on desktop and a sheet on a
 * phone; the facets inside are exactly the ones the API already supports, and
 * nothing here invents a dimension the backend cannot answer.
 *
 * The sheet is portalled to <body> because the toolbar above it is sticky and
 * owns a stacking context — a fixed sheet rendered inside it would sit under
 * the site header instead of over the page.
 */

/** One row of mutually exclusive options, the same control the interface facet uses. */
function Choice<T extends string | number | null>({ id, group, value, options, onPick }: {
  id: string; group: string; value: T; options: Array<{ value: T; label: string; count?: number | null; disabledReason?: string | null }>; onPick: (v: T) => void
}) {
  return (
    <div className={styles.facet}>
      <span className={styles.facetGroup} id={id}>{group}</span>
      <div className={styles.ifaceRow} role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`${styles.ifaceOpt} ${value === o.value ? styles.ifaceOptOn : ''}`}
            // A zero option stays visible with its reason; it never leads to an unexplained empty list (D6).
            disabled={Boolean(o.disabledReason) && value !== o.value}
            title={o.disabledReason ?? undefined}
            onClick={() => onPick(o.value)}
          >
            {o.label}
            {typeof o.count === 'number' ? <span className={styles.optCount}>{o.count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return narrow
}

function Facets({
  state,
  patch,
  activeCount,
  facets,
}: {
  state: MarketState
  patch: (p: Partial<MarketState>) => void
  activeCount: number
  facets: MarketFacetCounts | null
}) {
  const f = facets
  const zero = (n: number | undefined, why: string) => (f && n === 0 ? why : null)
  const proof = state.warranted ? 'warranted' : state.tested ? 'tested' : 'any'
  const provider = state.firstParty ? 'reference' : state.thirdParty ? 'third' : 'any'
  return (
    <>
      <Choice id="proof-group" group="Proof" value={proof}
        options={[
          { value: 'any', label: 'Any', count: f?.proof.any ?? null },
          { value: 'tested', label: 'Tested', count: f?.proof.tested ?? null, disabledReason: zero(f?.proof.tested, 'No agent in this view has a Marque test result.') },
          { value: 'warranted', label: 'Warranted', count: f?.proof.warranted ?? null, disabledReason: zero(f?.proof.warranted, 'No agent in this view holds a current warrant.') },
        ]}
        onPick={(v) => patch({ warranted: v === 'warranted', tested: v === 'tested' })} />

      <PriceSlider state={state} patch={patch} facets={f} />

      <Choice id="live-group" group="Availability" value={state.liveNow ? 'live' : 'any'}
        options={[
          { value: 'any', label: 'Any', count: f?.live.any ?? null },
          { value: 'live', label: 'Live now', count: f?.live.live ?? null, disabledReason: zero(f?.live.live, 'No agent in this view answered the latest probe.') },
        ]}
        onPick={(v) => patch({ liveNow: v === 'live' })} />

      <Choice id="provider-group" group="Provider" value={provider}
        options={[
          { value: 'any', label: 'Any', count: f?.provider.any ?? null },
          { value: 'third', label: 'Third-party', count: f?.provider.thirdParty ?? null, disabledReason: zero(f?.provider.thirdParty, 'Only Marque reference agents match the other filters.') },
          { value: 'reference', label: 'Marque reference', count: f?.provider.reference ?? null, disabledReason: zero(f?.provider.reference, 'No Marque reference agent matches the other filters.') },
        ]}
        onPick={(v) => patch({ thirdParty: v === 'third', firstParty: v === 'reference' })} />

      {/* Network is not a filter: the lane switch above the tabs chooses mainnet or practice (invariant 32). */}
      <Choice id="token-group" group="Paid in" value={state.token}
        options={[{ value: null, label: 'Any' }, ...(['U', 'USDT', 'USDC'] as const).map((t) => ({
          value: t, label: t, count: f?.token[t.toLowerCase()] ?? null,
          disabledReason: zero(f?.token[t.toLowerCase()], `No agent in this view quotes in ${t} right now.`),
        }))]}
        onPick={(v) => patch({ token: v })} />

      <Choice id="iface-group" group="Interface" value={state.iface}
        options={IFACES.map((i) => ({
          value: i.value, label: i.label, count: f ? (i.value ? f.iface[i.value] ?? 0 : f.iface['any'] ?? null) : null,
          disabledReason: i.value ? zero(f?.iface[i.value], `No agent in this view declares ${i.label}.`) : null,
        }))}
        onPick={(v) => patch({ iface: v })} />

      <Choice id="rating-group" group="Verified rating" value={state.minRating}
        options={[{ value: null, label: 'Any', count: f?.rating['any'] ?? null }, ...[3, 4, 4.5].map((n) => ({
          value: n, label: `${n}+`, count: f?.rating[String(n)] ?? null,
          disabledReason: zero(f?.rating[String(n)], `No agent in this view has a verified-buyer average of ${n} or more.`),
        }))]}
        onPick={(v) => patch({ minRating: v })} />

      <div className={styles.facetFoot}>
        <button
          type="button"
          className={styles.facetClear}
          disabled={activeCount === 0}
          onClick={() => patch(CLEARED_FILTERS)}
        >
          Clear all filters
        </button>
      </div>
    </>
  )
}

/**
 * Price, in the lane's token, over live quotes only. The range is the cheapest and dearest live
 * quote under the other filters; the thumb commits on release so the list does not refetch per pixel.
 */
function PriceSlider({ state, patch, facets }: { state: MarketState; patch: (p: Partial<MarketState>) => void; facets: MarketFacetCounts | null }) {
  const p = facets?.price
  const min = p?.min ?? 0
  const max = p?.max ?? 0
  const step = max > 10 ? 0.5 : max > 1 ? 0.05 : 0.01
  const top = Math.ceil(max / step) * step
  const [draft, setDraft] = useState<number | null>(state.maxPrice)
  useEffect(() => setDraft(state.maxPrice), [state.maxPrice])
  const shown = draft ?? top
  const unit = state.token ?? p?.unit ?? ''
  const commit = () => patch({ maxPrice: draft === null || draft >= top ? null : Number(draft.toFixed(2)) })
  const fmt = (n: number) => (n >= 1 ? n.toFixed(2) : n.toFixed(n >= 0.1 ? 2 : 3))
  return (
    <div className={styles.facet}>
      <span className={styles.facetGroup} id="price-group">Price per job</span>
      {p && p.quoted > 0 && max > 0 ? (
        <div className={styles.priceSlide}>
          <input
            type="range"
            aria-labelledby="price-group"
            aria-valuetext={draft === null || draft >= top ? 'Any price' : `At most ${fmt(shown)} ${unit}`}
            min={Math.floor(min / step) * step}
            max={top}
            step={step}
            value={Math.min(shown, top)}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
          <span className={styles.priceRead}>
            {draft === null || draft >= top ? <>Any price <span className={styles.facetHint}>{p.quoted} live {p.quoted === 1 ? 'quote' : 'quotes'}, {fmt(min)} to {fmt(max)} {unit}</span></> : <>At most <b className="mono">{fmt(shown)} {unit}</b></>}
          </span>
        </div>
      ) : (
        <span className={styles.facetHint}>No live quotes under these filters, so there is no price to filter by.</span>
      )}
    </div>
  )
}

export function MarketFilters({
  state,
  patch,
  activeCount,
  facets,
  total,
}: {
  state: MarketState
  patch: (p: Partial<MarketState>) => void
  activeCount: number
  facets: MarketFacetCounts | null
  total: number | null
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const narrow = useIsNarrow()
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  // Collision-aware placement (D5): right-aligned to the trigger, clamped inside the viewport
  // with 16 px margins, opened above when there is more room there, and scrolled internally.
  const [place, setPlace] = useState<{ left: number; width: number; maxHeight: number; above: boolean } | null>(null)
  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const r = wrap.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const M = 16
    const width = Math.min(640, vw - 2 * M)
    let left = r.right - width
    if (left < M) left = r.left
    left = Math.max(M, Math.min(left, vw - M - width))
    const header = document.querySelector<HTMLElement>('.site-header')?.getBoundingClientRect().bottom ?? 0
    const below = vh - r.bottom - 8 - M
    const aboveRoom = r.top - 8 - Math.max(M, header + 8)
    const above = below < 360 && aboveRoom > below
    setPlace({ left: left - r.left, width, maxHeight: Math.max(220, Math.floor(above ? aboveRoom : below)), above })
  }, [])
  useLayoutEffect(() => {
    if (!open || narrow) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure) }
  }, [open, narrow, measure])

  useEffect(() => setMounted(true), [])

  // Escape always closes; an outside click closes the desktop popover (the
  // sheet has its own scrim).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (narrow) return
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    panelRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, narrow])

  // Closing the sheet on a resize to desktop avoids a stranded scrim.
  useEffect(() => {
    if (!open) return
    const prev = narrow ? document.body.style.overflow : null
    if (narrow) document.body.style.overflow = 'hidden'
    return () => {
      if (prev !== null) document.body.style.overflow = prev
    }
  }, [open, narrow])

  const trigger = (
    <button
      ref={btnRef}
      type="button"
      className={`${styles.toolBtn} ${activeCount > 0 ? styles.toolBtnOn : ''}`}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => {
        if (!open && !narrow) {
          // Give the panel room below: bring the sticky toolbar up under the header first,
          // so the results stay in view behind it. Placement still flips if room is short.
          const r = wrapRef.current?.getBoundingClientRect()
          const header = document.querySelector<HTMLElement>('.site-header')?.getBoundingClientRect().bottom ?? 0
          if (r && window.innerHeight - r.bottom < 420 && r.top - header > 24) {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            window.scrollBy({ top: r.top - header - 12, behavior: reduce ? 'auto' : 'smooth' })
          }
        }
        setOpen((v) => !v)
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M2 4h12M4.5 8h7M7 12h2" />
      </svg>
      Filters
      {activeCount > 0 && <span className={styles.toolCount}>{activeCount}</span>}
    </button>
  )

  const facetsEl = <Facets state={state} patch={patch} activeCount={activeCount} facets={facets} />

  return (
    <div ref={wrapRef} className={styles.filtersWrap}>
      {trigger}

      {/* Desktop: an anchored popover inside the toolbar. */}
      {!narrow && open && (
        <div
          ref={panelRef}
          className={styles.filterPop}
          role="dialog"
          aria-label="Filters"
          data-above={place?.above || undefined}
          style={place ? { left: place.left, width: place.width, maxHeight: place.maxHeight } : { visibility: 'hidden' }}
        >
          {facetsEl}
        </div>
      )}

      {/* Phone: a sheet over the page, portalled out of the sticky toolbar. */}
      {narrow && mounted && open &&
        createPortal(
          <>
            <div className={styles.sheetScrim} onClick={close} aria-hidden="true" />
            <div ref={panelRef} className={styles.sheet} role="dialog" aria-modal="true" aria-label="Filters">
              <div className={styles.sheetHead}>
                <span className={styles.sheetTitle}>Filters</span>
                <button type="button" className={styles.sheetClose} onClick={close} aria-label="Close filters">
                  ×
                </button>
              </div>
              <div className={styles.sheetBody}>{facetsEl}</div>
              <div className={styles.sheetFoot}>
                <button type="button" className={styles.sheetApply} onClick={close} disabled={total === 0}>
                  {total === null ? 'Show results' : total === 0 ? 'No agents match' : `Show ${total.toLocaleString()} ${total === 1 ? 'agent' : 'agents'}`}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
