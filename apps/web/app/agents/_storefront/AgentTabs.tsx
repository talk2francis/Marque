'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SECTIONS } from './sections'
import page from './agent-page.module.css'

export function AgentTabs({ base, name, active }: { base: string; name: string; active: string }) {
  const router = useRouter()
  const nav = useRef<HTMLElement>(null)
  const prefetched = useRef(new Set<string>())
  const [opening, setOpening] = useState<string | null>(null)
  useEffect(() => { prefetched.current.clear() }, [base])
  useEffect(() => { setOpening(null) }, [base, active])
  const prepare = useCallback((href: string) => {
    if (prefetched.current.has(href)) return
    prefetched.current.add(href)
    router.prefetch(href)
  }, [router])
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData || !nav.current || typeof IntersectionObserver === 'undefined') return
    const timers: ReturnType<typeof setTimeout>[] = []
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return
      observer.disconnect()
      // Only the visible agent's sections, staggered, and never tasks or quotes.
      SECTIONS.filter(s => s.id !== active).forEach((s, i) => timers.push(setTimeout(() => {
        if (document.visibilityState === 'visible') prepare(`${base}${s.path}`)
      }, 500 + i * 600)))
    })
    observer.observe(nav.current)
    return () => { observer.disconnect(); timers.forEach(clearTimeout) }
  }, [base, active, prepare])
  return <nav ref={nav} className={page.tabs} aria-label={`${name} sections`}>
    {SECTIONS.map(s => {
      const href = `${base}${s.path}`
      return <Link key={s.id} href={href} prefetch={false} scroll={false} aria-current={s.id === active ? 'page' : undefined} className={page.tab}
        onMouseEnter={() => prepare(href)} onFocus={() => prepare(href)} onTouchStart={() => prepare(href)}
        onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0 && s.id !== active) setOpening(s.label) }}>
        {s.label}{opening === s.label ? <span className={page.tabPending} aria-hidden="true"> ···</span> : null}
      </Link>
    })}
    <span className={page.tabStatus} role="status">{opening ? `Opening ${opening}` : ''}</span>
  </nav>
}
