'use client'
import { useEffect, useState } from 'react'
import styles from '../docs.module.css'

/**
 * The contents rail: highlights the last section whose heading has passed under
 * the header. One passive scroll listener, one read per frame.
 */
export function ScrollSpy({ items }: { items: Array<{ id: string; label: string }> }) {
  const [active, setActive] = useState(items[0]?.id ?? '')
  useEffect(() => {
    let raf = 0
    const pick = () => {
      raf = 0
      let cur = items[0]?.id ?? ''
      for (const i of items) {
        const el = document.getElementById(i.id)
        if (el && el.getBoundingClientRect().top <= 150) cur = i.id
      }
      // At the very bottom the last short sections never reach the line: take the last.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = items[items.length - 1]?.id ?? cur
      setActive(cur)
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(pick) }
    pick()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf) }
  }, [items])
  return (
    <nav className={styles.spy} aria-label="On this page">
      <span className="t-label">Contents</span>
      <ol>
        {items.map((i) => (
          <li key={i.id}><a href={`#${i.id}`} aria-current={active === i.id ? 'location' : undefined}>{i.label}</a></li>
        ))}
      </ol>
    </nav>
  )
}
