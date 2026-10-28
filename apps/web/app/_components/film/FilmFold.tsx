'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { track } from '../../../lib/track'
import styles from './film.module.css'

/**
 * The film, folded (28 Oct): one quiet line on the home page that opens the screening room in place. A link to
 * #film opens it; closing it pauses the film. The hero's "Watch the film" opens it before it plays (FilmCue).
 */
export function FilmFold({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (window.location.hash === '#film' && ref.current) ref.current.open = true
  }, [])
  return (
    <details
      ref={ref} className={styles.foldDetails}
      onToggle={(e) => {
        const d = e.currentTarget
        if (!d.open) d.querySelectorAll('video').forEach((v) => v.pause())
        else track('film_cta', { to: 'film', from: 'fold' })
      }}
    >
      <summary className={styles.foldBar}>
        <span className={styles.foldInner}>
          <span className={styles.cueDisc} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg></span>
          <span className={styles.foldText}>
            <span className="t-label">The film</span>
            <span className={styles.foldTitle}>Sixty seconds, <em>on the record.</em></span>
          </span>
          <span className={styles.foldMeta}>1:00 · sound on</span>
          <span className={styles.foldAction} aria-hidden="true">
            <span data-closed>Watch</span><span data-open>Close</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </span>
      </summary>
      {children}
    </details>
  )
}
