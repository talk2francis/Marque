'use client'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface TabDef { id: string; label: string; count?: number; content: ReactNode }

const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * WAI-ARIA tabs: arrow keys, Home and End move between tabs; the brass ink
 * slides to the selected one. A panel mounts the first time it is shown and
 * stays mounted, so its state survives a switch.
 */
export function Tabs({ tabs, label, value, onChange, initial }: { tabs: TabDef[]; label: string; value?: string; onChange?: (id: string) => void; initial?: string }) {
  const [inner, setInner] = useState(initial ?? tabs[0]?.id ?? '')
  const active = value ?? inner
  const idx = Math.max(0, tabs.findIndex((t) => t.id === active))
  const base = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const listRef = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState<Set<string>>(() => new Set([active]))
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null)

  useEffect(() => { setSeen((s) => (s.has(active) ? s : new Set(s).add(active))) }, [active])
  const measure = useCallback(() => {
    const b = refs.current[idx]
    if (b) setInk({ x: b.offsetLeft, w: b.offsetWidth })
  }, [idx])
  useIsoLayout(() => { measure() }, [measure, tabs.length])
  useEffect(() => {
    const ro = new ResizeObserver(measure)
    if (listRef.current) ro.observe(listRef.current)
    return () => ro.disconnect()
  }, [measure])

  const select = (i: number) => {
    const t = tabs[i]
    if (!t) return
    setInner(t.id)
    onChange?.(t.id)
    refs.current[i]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="tabs-list" ref={listRef}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el }}
            role="tab"
            id={`${base}-t-${t.id}`}
            aria-controls={`${base}-p-${t.id}`}
            aria-selected={i === idx}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => {
              const n = tabs.length
              if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % n) }
              if (e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + n) % n) }
              if (e.key === 'Home') { e.preventDefault(); select(0) }
              if (e.key === 'End') { e.preventDefault(); select(n - 1) }
            }}
          >
            {t.label}
            {t.count !== undefined ? <span className="tabs-count">{t.count.toLocaleString('en-US')}</span> : null}
          </button>
        ))}
        {ink ? <span className="tabs-ink" aria-hidden="true" style={{ width: ink.w, transform: `translateX(${ink.x}px)` }} /> : null}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`${base}-p-${t.id}`} aria-labelledby={`${base}-t-${t.id}`} hidden={i !== idx} className="tabs-panel" tabIndex={0}>
          {seen.has(t.id) || i === idx ? t.content : null}
        </div>
      ))}
    </div>
  )
}
