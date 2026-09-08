'use client'

import { useEffect, useState } from 'react'
import styles from './site.module.css'

type Mode = 'light' | 'dark'

/**
 * The daylight / night switch. An explicit choice is stored in localStorage and
 * wins over the OS preference; with nothing stored the OS decides (handled in
 * CSS). The pre-paint bootstrap in layout.tsx keeps this flash-free.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null)

  useEffect(() => {
    const stored = (() => {
      try { return localStorage.getItem('marque-theme') as Mode | null } catch { return null }
    })()
    if (stored === 'light' || stored === 'dark') {
      setMode(stored)
    } else {
      setMode(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    }
  }, [])

  function flip() {
    const next: Mode = mode === 'dark' ? 'light' : 'dark'
    setMode(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('marque-theme', next) } catch { /* private mode */ }
  }

  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={flip}
      aria-label={mode === 'dark' ? 'Switch to daylight' : 'Switch to night'}
      title={mode === 'dark' ? 'Daylight' : 'Night'}
    >
      {/* Sun in daylight, moon at night — outlined, 1.5 stroke, no fill. */}
      {mode === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  )
}
