'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { Chip, DataCell, WarrantBadge, EmptyState, ProvenanceChip, LinkButton } from '@marque/ui'
import { ReferenceMark } from '../_components/ReferenceMark'
import styles from './register.module.css'

interface MarketRow {
  agentId: string
  tokenId: string | null
  name: string
  category: string | null
  isReference: boolean
  identityCount: number
  ownerLabel: string | null
  host: string | null
  liveness: string | null
  latencyMs: number | null
  interfaces: string[]
  protocols: string[]
  price: string | null
  warrant: { status: 'warranted' | 'failed' | 'untested'; testId: string | null; date: string | null; failedField: string | null }
  qual: 'warranted' | 'failed' | 'callable' | 'unbound' | 'dead'
  previewable: boolean
  hireBlockedReason: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing', grid: 'Grid', yield: 'Yield', health_factor: 'Health factor', security: 'Security',
}
const CHIPS: Array<{ v: string | null; label: string }> = [
  { v: null, label: 'All' }, { v: 'rebalancing', label: 'Rebalancing' }, { v: 'grid', label: 'Grid' },
  { v: 'yield', label: 'Yield' }, { v: 'health_factor', label: 'Health factor' }, { v: 'security', label: 'Security' },
]
const SORTS: Array<{ v: string; label: string }> = [
  { v: 'best', label: 'Best match' }, { v: 'proven', label: 'Most proven' }, { v: 'price', label: 'Lowest price' },
  { v: 'fast', label: 'Fastest' }, { v: 'recent', label: 'Recently tested' },
]
const IFACES = ['a2a', 'mcp', 'x402', 'erc8183']

function agoDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toISOString().slice(0, 10)
}

export function Marketplace({ category: fixedCategory }: { category?: string }) {
  const [rows, setRows] = useState<MarketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(fixedCategory ?? null)
  const [sort, setSort] = useState('best')
  const [liveNow, setLiveNow] = useState(false)
  const [warranted, setWarranted] = useState(false)
  const [thirdParty, setThirdParty] = useState(false)
  const [hasPrice, setHasPrice] = useState(false)
  const [iface, setIface] = useState<string | null>(null)

  const [selected, setSelected] = useState<MarketRow[]>([])
  const rowRects = useRef<Map<string, number>>(new Map())

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (category) p.set('category', category)
    if (search.trim()) p.set('q', search.trim())
    if (sort !== 'best') p.set('sort', sort)
    if (liveNow) p.set('live', '1')
    if (warranted) p.set('warranted', '1')
    if (thirdParty) p.set('thirdParty', '1')
    if (hasPrice) p.set('hasPrice', '1')
    if (iface) p.set('iface', iface)
    return p.toString()
  }, [category, search, sort, liveNow, warranted, thirdParty, hasPrice, iface])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/v1/marketplace?${qs}&limit=48`, { cache: 'no-store' })
          const j = await res.json()
          if (cancelled) return
          if (!res.ok) { setError(j.detail ?? j.error ?? 'Could not load the marketplace.'); setRows([]) }
          else { setRows(j.agents ?? []); setGeneratedAt(j.generatedAt ?? null) }
        } catch {
          if (!cancelled) setError('Could not reach the marketplace.')
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
  }, [qs])

  // FLIP: remember row positions before a reorder, animate the delta after.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const next = new Map<string, number>()
    el.querySelectorAll<HTMLElement>('[data-agent]').forEach((n) => {
      const id = n.dataset.agent!
      const top = n.getBoundingClientRect().top
      const prev = rowRects.current.get(id)
      if (prev !== undefined && Math.abs(prev - top) > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        n.animate(
          [{ transform: `translateY(${prev - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' },
        )
      }
      next.set(id, top)
    })
    rowRects.current = next
  }, [rows])

  const toggleSelect = useCallback((r: MarketRow) => {
    setSelected((cur) => {
      if (cur.some((x) => x.agentId === r.agentId)) return cur.filter((x) => x.agentId !== r.agentId)
      if (cur.length >= 3) return cur
      return [...cur, r]
    })
  }, [])

  const compareHref = `/compare?agents=${selected.map((s) => encodeURIComponent(s.agentId)).join(',')}`
  const countedAgo = generatedAt
    ? (() => {
        const s = Math.round((Date.now() - Date.parse(generatedAt)) / 1000)
        return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`
      })()
    : null

  return (
    <>
      {/* Controls above the results (P10.5B item 5). */}
      <div className={styles.controls}>
        <input
          className={styles.search}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents, protocols or capabilities"
          aria-label="Search the marketplace"
          spellCheck={false}
        />
        <div className={styles.chips} role="group" aria-label="Category">
          {CHIPS.filter((c) => !fixedCategory || c.v === fixedCategory || c.v === null).map((c) => (
            <button
              key={c.label}
              type="button"
              className={`${styles.chip} ${category === c.v ? styles.chipOn : ''}`}
              aria-pressed={category === c.v}
              onClick={() => setCategory(c.v)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className={styles.filterRow}>
          {([
            ['Live now', liveNow, setLiveNow],
            ['Warranted', warranted, setWarranted],
            ['Third-party only', thirdParty, setThirdParty],
            ['Has a price', hasPrice, setHasPrice],
          ] as const).map(([label, on, set]) => (
            <button key={label} type="button" className={`${styles.toggle} ${on ? styles.toggleOn : ''}`} aria-pressed={on} onClick={() => set(!on)}>
              {label}
            </button>
          ))}
          <select className={styles.select} value={iface ?? ''} onChange={(e) => setIface(e.target.value || null)} aria-label="Interface">
            <option value="">Any interface</option>
            {IFACES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {countedAgo && (
        <p className={styles.status}>
          <ProvenanceChip provenance="MEASURED" /> Ranked by qualification — warranted first, then
          tested-and-failed, then callable. Deduplicated by operator. Measured {countedAgo}.
        </p>
      )}

      {loading && <p className={styles.status}>Loading…</p>}
      {error && <div className={styles.error} role="alert">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <EmptyState title="No agent matches these filters yet.">
          <p>This is the real count, not a loading state. Loosen a filter, or list an agent that belongs here.</p>
        </EmptyState>
      )}

      {!loading && rows.length > 0 && (
        <div className={styles.rows} ref={listRef}>
          {rows.map((a) => {
            const live = a.liveness === 'live'
            const picked = selected.some((s) => s.agentId === a.agentId)
            const hireable = a.hireBlockedReason === null
            return (
              <div className={styles.mktRow} data-agent={a.agentId} key={a.agentId}>
                <div className={styles.mktMain}>
                  <div className={styles.mktNameLine}>
                    <Link href={a.isReference ? `/register#reference-agents` : `/agents/56/${a.tokenId}`} className={styles.name}>
                      {a.name}
                    </Link>
                    {a.isReference && <ReferenceMark compact />}
                    {a.identityCount > 1 && (
                      <Link href={`/agents/56/${a.tokenId}`} className={styles.dupes}>
                        {a.identityCount.toLocaleString()} registered identities · view all
                      </Link>
                    )}
                  </div>
                  <div className={styles.mktSub}>
                    {a.category && a.category !== 'unclassified' && <Chip>{CATEGORY_LABEL[a.category] ?? a.category}</Chip>}
                    {a.interfaces.slice(0, 2).map((k) => <Chip key={k}>{k}</Chip>)}
                    {a.ownerLabel && <span className={styles.owner}>{a.ownerLabel}</span>}
                  </div>
                </div>

                <span className={styles.mktLive}>
                  <span className={`${styles.dot} ${live ? styles.dotLive : styles.dotDown}`} aria-hidden="true" />
                  <DataCell muted={!live}>{a.latencyMs != null ? `${a.latencyMs} ms` : live ? 'live' : (a.liveness ?? '—')}</DataCell>
                </span>

                <span className={styles.mktWarrant}>
                  <WarrantBadge
                    status={a.warrant.status}
                    date={agoDate(a.warrant.date) ?? undefined}
                    testId={a.warrant.testId ?? undefined}
                    failedField={a.warrant.failedField ?? undefined}
                  />
                </span>

                <span className={styles.mktPrice}>
                  {a.price ?? <span className={styles.noPrice}>price not advertised</span>}
                </span>

                <span className={styles.mktActions}>
                  <button
                    type="button"
                    className={`${styles.compareBtn} ${picked ? styles.compareOn : ''}`}
                    aria-pressed={picked}
                    disabled={!picked && selected.length >= 3}
                    onClick={() => toggleSelect(a)}
                  >
                    {picked ? 'Selected' : 'Compare'}
                  </button>
                  {a.previewable
                    ? <LinkButton size="sm" variant="secondary" href={`/agents/56/${a.tokenId}#preview`}>Preview</LinkButton>
                    : <button type="button" className={styles.actionMuted} disabled title="Read-only preview not supported">Preview</button>}
                  {hireable
                    ? <LinkButton size="sm" variant="primary" href={`/app/charter?agent=${encodeURIComponent(a.agentId)}${a.category ? `&category=${a.category}` : ''}`}>Hire</LinkButton>
                    : <button type="button" className={styles.actionMuted} disabled title={a.hireBlockedReason ?? undefined}>Hire — {a.hireBlockedReason}</button>}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Sticky compare tray (P10.5B item 6). */}
      {selected.length >= 2 && (
        <div className={styles.tray} role="region" aria-label="Compare tray">
          <span className={styles.trayList}>
            {selected.map((s) => (
              <span key={s.agentId} className={styles.trayChip}>
                {s.name}
                <button type="button" aria-label={`Remove ${s.name}`} onClick={() => toggleSelect(s)}>×</button>
              </span>
            ))}
          </span>
          <LinkButton variant="primary" size="sm" href={compareHref}>Compare {selected.length}</LinkButton>
        </div>
      )}
    </>
  )
}
