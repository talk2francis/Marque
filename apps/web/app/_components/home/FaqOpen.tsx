'use client'
import { useEffect } from 'react'
import { track } from '../../../lib/track'

/**
 * The questions' only script, and none of it is needed to read them: a link to one answer (/#is-marque-safe) opens
 * it, and opening an answer is counted once per page view by its id (anonymous, lib/track.ts).
 */
export function FaqOpen({ ids }: { ids: string[] }) {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!ids.includes(id)) return
      const el = document.getElementById(id)
      if (el instanceof HTMLDetailsElement) { el.open = true; requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })) }
    }
    open()
    window.addEventListener('hashchange', open)
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLDetailsElement => e instanceof HTMLDetailsElement)
    // the first answer is open as the page loads; only an answer opened after that is counted
    const t0 = performance.now()
    const on = (e: Event) => { const d = e.currentTarget as HTMLDetailsElement; if (d.open && performance.now() - t0 > 800) track('faq_open', { id: d.id }, { once: true }) }
    els.forEach((d) => d.addEventListener('toggle', on))
    return () => { window.removeEventListener('hashchange', open); els.forEach((d) => d.removeEventListener('toggle', on)) }
  }, [ids])
  return null
}
