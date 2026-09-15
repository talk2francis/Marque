'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import styles from './register.module.css'

/**
 * A native <details> that also opens when something links to its id.
 *
 * The marketplace moves several long-but-true explanations behind disclosures.
 * Anything that used to be a visible anchor target — `/register#reference-agents`
 * is linked from every ReferenceMark on the site — has to still land the reader
 * on opened content, or progressive disclosure quietly becomes a broken link.
 */
export function Disclosure({
  id,
  summary,
  hint,
  children,
  tone = 'default',
  lazy = false,
}: {
  id?: string
  summary: string
  /** A short line that stays visible while the disclosure is closed. */
  hint?: ReactNode
  children: ReactNode
  tone?: 'default' | 'quiet'
  /**
   * Hold the body out of the DOM until first opened. A closed <details> still
   * mounts its children, so a data-fetching panel inside one bills every
   * visitor for a request they never asked for.
   */
  lazy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const ref = useRef<HTMLDetailsElement>(null)
  const auto = useId()
  const domId = id ?? auto

  useEffect(() => {
    if (!id) return
    const check = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true)
        setEverOpened(true)
        // Let the open state paint before scrolling to it.
        requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'start', behavior: 'auto' }))
      }
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [id])

  return (
    <details
      ref={ref}
      id={domId}
      className={`${styles.disclosure} ${tone === 'quiet' ? styles.disclosureQuiet : ''}`}
      open={open}
      onToggle={(e) => {
        const isOpen = (e.currentTarget as HTMLDetailsElement).open
        setOpen(isOpen)
        if (isOpen) setEverOpened(true)
      }}
    >
      <summary className={styles.disclosureSummary}>
        <span className={styles.disclosureCaret} aria-hidden="true" />
        <span className={styles.disclosureTitle}>{summary}</span>
        {hint && <span className={styles.disclosureHint}>{hint}</span>}
      </summary>
      <div className={styles.disclosureBody}>{!lazy || everOpened ? children : null}</div>
    </details>
  )
}
