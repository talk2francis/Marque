'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { NAV, NAV_GROUPS, type Active } from './nav-items'
import styles from './site.module.css'

/**
 * The small-screen navigation.
 *
 * A burger in the header opens a panel that slides in from the right, over the
 * page — the page itself never moves, and body scroll is locked while it is
 * open. The panel is portalled to <body> so it escapes the header's
 * backdrop-filter (which would otherwise become its containing block and trap a
 * `position: fixed` child). Closes on: the burger, the scrim, Escape, choosing a
 * link, or the viewport growing back to desktop width.
 */
export function MobileNav({ active }: { active?: Active }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => setMounted(true), [])

  // Any route change closes the panel (covers client-side nav where the anchor
  // handler alone might race the transition).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const { body } = document
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    // Move focus into the panel, restore it to the burger on close.
    const first = panelRef.current?.querySelector<HTMLElement>('a, button')
    first?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      body.style.overflow = prevOverflow
      burgerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isCurrent = (href: string, key?: Active) =>
    pathname === href || (key != null && active === key)

  return (
    <>
      <button
        ref={burgerRef}
        type="button"
        className={styles.navBurger}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.navBurgerBox} data-open={open || undefined}>
          <span />
          <span />
          <span />
        </span>
      </button>

      {mounted &&
        createPortal(
          <>
            <div
              className={styles.navScrim}
              data-open={open || undefined}
              onClick={close}
              aria-hidden="true"
            />
            <div
              ref={panelRef}
              id="mobile-nav-panel"
              className={styles.navPanel}
              data-open={open || undefined}
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
            >
              <nav className={styles.navPanelInner} aria-label="Site">
                <div className={styles.navPanelGroup}>
                  {NAV.map((n) => (
                    <a
                      key={n.key}
                      href={n.href}
                      className={styles.navPanelLink}
                      aria-current={isCurrent(n.href, n.key) ? 'page' : undefined}
                      onClick={close}
                    >
                      {n.label}
                    </a>
                  ))}
                </div>
                {NAV_GROUPS.map((g) => (
                  <div key={g.label} className={styles.navPanelGroup}>
                    <span className={styles.navPanelHead}>{g.label}</span>
                    {g.items.map((it) => (
                      <a
                        key={it.href}
                        href={it.href}
                        className={styles.navPanelLink}
                        aria-current={isCurrent(it.href) ? 'page' : undefined}
                        {...(it.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                        onClick={close}
                      >
                        {it.label}
                        {it.external && (
                          <span className={styles.navMenuExt} aria-hidden="true">
                            {' '}
                            ↗
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                ))}
              </nav>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
