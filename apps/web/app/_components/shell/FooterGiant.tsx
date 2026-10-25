'use client'
import { useEffect, useRef } from 'react'
import { Wordmark } from '../brand/Wordmark'

/**
 * The footer wordmark: the plain lockup, which rises and grows (78% to 100%) as the reader scrolls into the
 * footer, tied to the scroll itself so it never runs on its own or makes anyone wait. CSS scroll-driven animation
 * where supported (off the main thread); elsewhere a scroll listener that only runs while the footer is on screen.
 * Decorative only (aria-hidden); reduced motion shows the still word at full size.
 */
export function FooterGiant() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || CSS.supports('animation-timeline: view()') || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (r.height + innerHeight * 0.35)))
      el.style.setProperty('--grow', String(0.78 + 0.22 * p))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) { addEventListener('scroll', onScroll, { passive: true }); update() } else removeEventListener('scroll', onScroll)
    })
    io.observe(el)
    return () => { io.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
  return (
    <div ref={ref} className="footer-giant" aria-hidden="true">
      <Wordmark className="footer-giant-word" />
    </div>
  )
}
