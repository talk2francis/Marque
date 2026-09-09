'use client'

import { useEffect, useId, useRef, useState } from 'react'
import styles from './site.module.css'

/**
 * One nav group that opens a small menu.
 *
 * Keeps the primary bar to a handful of labels while making the deeper routes —
 * the proof run, receipts, status, the builder pages — reachable in one click
 * from anywhere instead of only from the footer. Hover to open on a pointer,
 * click/Enter for keyboard and touch, Escape and outside-click to close.
 */
export interface NavMenuItem {
  label: string
  href: string
  external?: boolean
}

export function NavMenu({
  label,
  items,
  active,
}: {
  label: string
  items: NavMenuItem[]
  active?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={wrapRef}
      className={styles.navGroup}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={styles.navGroupBtn}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={id}
        {...(active ? { 'aria-current': 'page' as const } : {})}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className={styles.navCaret} aria-hidden="true" />
      </button>
      <div className={styles.navMenu} id={id} role="menu" hidden={!open}>
        {items.map((it) => (
          <a
            key={it.href}
            href={it.href}
            role="menuitem"
            className={styles.navMenuItem}
            {...(it.external ? { target: '_blank', rel: 'noreferrer' } : {})}
            onClick={() => setOpen(false)}
          >
            {it.label}
            {it.external && <span className={styles.navMenuExt} aria-hidden="true"> ↗</span>}
          </a>
        ))}
      </div>
    </div>
  )
}
