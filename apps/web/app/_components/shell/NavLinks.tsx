'use client'
import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { NAV, DOC_GROUPS, PROOF_GROUPS, PROOF_KEYS, type Active } from '../nav-items'
import { NavGlyph } from './icons'

/**
 * The desktop nav: five links and the Proof menu in one hairline capsule. A
 * soft highlight glides to whichever entry the pointer is on; the current page
 * carries a brass dot.
 */
export function NavLinks({ active }: { active?: Active }) {
  const wrap = useRef<HTMLElement>(null)
  const [hi, setHi] = useState<{ x: number; w: number } | null>(null)
  const track = (el: HTMLElement | null) => {
    if (!el || !wrap.current) return
    setHi({ x: el.offsetLeft, w: el.offsetWidth })
  }
  return (
    <nav ref={wrap} className="nav-capsule" aria-label="Main" onPointerLeave={() => setHi(null)}>
      <span className="nav-hi" data-on={hi ? '' : undefined} style={hi ? { width: hi.w, transform: `translateX(${hi.x}px)` } : undefined} aria-hidden="true" />
      {NAV.filter(n => n.key !== 'docs').map((n) => (
        <a key={n.key} href={n.href} className="nav-link" aria-current={active === n.key ? 'page' : undefined} onPointerEnter={(e) => track(e.currentTarget)} onFocus={(e) => track(e.currentTarget)}>
          {n.label}
        </a>
      ))}
      <ProofMenu label="Docs" groups={DOC_GROUPS} current={active === 'docs'} onHover={track} />
      <ProofMenu label="Proof" groups={PROOF_GROUPS} current={active ? PROOF_KEYS.includes(active) : false} onHover={track} />
    </nav>
  )
}

function ProofMenu({ label, groups, current, onHover }: { label: string; groups: typeof PROOF_GROUPS; current: boolean; onHover: (el: HTMLElement | null) => void }) {
  const [open, setOpen] = useState(false)
  const pinned = useRef(false)
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  const close = useCallback((focusBack = false) => {
    pinned.current = false
    setOpen(false)
    if (focusBack) btn.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(true); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (!ref.current?.contains(document.activeElement)) return
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('.navm-item') ?? [])
      if (!items.length) return
      e.preventDefault()
      const i = items.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
      items[i === -1 ? 0 : next]?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, close])

  return (
    <div
      ref={ref}
      className="navm"
      data-open={open ? '' : undefined}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close() }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true) }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !pinned.current) setOpen(false) }}
    >
      <button
        ref={btn}
        type="button"
        className="nav-link navm-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={id}
        aria-current={current ? 'page' : undefined}
        onPointerEnter={(e) => onHover(e.currentTarget)}
        onFocus={(e) => onHover(e.currentTarget)}
        onClick={() => { if (pinned.current) close(); else { pinned.current = true; setOpen(true) } }}
      >
        {label}<ChevronDown size={14} aria-hidden="true" />
      </button>
      <div className="navm-panel" id={id} hidden={!open}>
        <div className="navm-groups">
          {groups.map((g) => (
            <div key={g.label} className="navm-group">
              <span className="t-label navm-head">{g.label}</span>
              {g.items.map((it) => (
                <a key={it.href} href={it.href} className="navm-item" onClick={() => close()}>
                  <span className="navm-ico"><NavGlyph name={it.icon} /></span>
                  <span className="navm-txt">
                    <span className="navm-label">{it.label}</span>
                    <span className="navm-note">{it.note}</span>
                  </span>
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
