'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { NavMenuItem } from './nav-items'
import styles from './site.module.css'

export type { NavMenuItem }

/**
 * One nav group that opens a small menu.
 *
 * Two ways in, and they no longer fight each other:
 *  - hovering the label opens the menu transiently (closes again on mouse-out);
 *  - clicking the label *pins* it open, so it stays put while you move the
 *    pointer down to a row. A second click on the label closes it.
 * Escape, an outside click, or picking a row also closes and unpins. Touch
 * devices only ever see the click path, which is exactly the pin toggle.
 */
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
  const pinnedRef = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = useCallback(() => {
    pinnedRef.current = false
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <div
      ref={wrapRef}
      className={styles.navGroup}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinnedRef.current) setOpen(false)
      }}
    >
      <button
        type="button"
        className={styles.navGroupBtn}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={id}
        {...(active ? { 'aria-current': 'page' as const } : {})}
        onClick={() => {
          if (pinnedRef.current) {
            close()
          } else {
            pinnedRef.current = true
            setOpen(true)
          }
        }}
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
            onClick={close}
          >
            {it.label}
            {it.external && <span className={styles.navMenuExt} aria-hidden="true"> ↗</span>}
          </a>
        ))}
      </div>
    </div>
  )
}
