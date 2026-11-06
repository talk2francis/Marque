'use client'
import { useEffect } from 'react'
import { track } from '../../../lib/track'

/** Native details stay readable without JavaScript; hash landing stops as soon as the reader interacts. */
export function FaqOpen({ ids }: { ids: string[] }) {
  useEffect(() => {
    let cancelLanding = () => {}
    const open = () => {
      cancelLanding()
      let id: string
      try { id = decodeURIComponent(window.location.hash.slice(1)) } catch { return }
      if (!ids.includes(id)) return
      const el = document.getElementById(id)
      if (!(el instanceof HTMLDetailsElement)) return
      el.open = true
      let active = true, frame = 0
      const align = () => { if (active) { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (active) el.scrollIntoView({ block: 'start', behavior: 'instant' }) }) } }
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(align)
      const stop = () => {
        active = false; cancelAnimationFrame(frame); observer?.disconnect(); clearTimeout(timer)
        for (const event of ['wheel', 'touchmove', 'pointerdown', 'keydown']) window.removeEventListener(event, stop)
      }
      const timer = setTimeout(stop, 2500)
      cancelLanding = stop
      for (const event of ['wheel', 'touchmove', 'pointerdown', 'keydown']) window.addEventListener(event, stop, { passive: true })
      observer?.observe(document.body)
      void document.fonts.ready.then(align).catch(() => {})
      align()
    }
    open()
    window.addEventListener('hashchange', open)
    const els = ids.map(id => document.getElementById(id)).filter((e): e is HTMLDetailsElement => e instanceof HTMLDetailsElement)
    const t0 = performance.now()
    const on = (e: Event) => { const d = e.currentTarget as HTMLDetailsElement; if (d.open && performance.now() - t0 > 800) track('faq_open', { id: d.id }, { once: true }) }
    els.forEach(d => d.addEventListener('toggle', on))
    return () => { cancelLanding(); window.removeEventListener('hashchange', open); els.forEach(d => d.removeEventListener('toggle', on)) }
  }, [ids])
  return null
}
