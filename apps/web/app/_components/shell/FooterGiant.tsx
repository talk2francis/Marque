'use client'
import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '../brand/Wordmark'
import { MARKET_EVENT } from './MarketGlint'

/**
 * The footer wordmark (DESIGN-V4 7): letters rise with a 70 ms stagger as the footer enters view, a brass band crosses
 * them every 14 s, and the word catches light once when a real hire or settlement is indexed during the visit.
 * Decorative only (aria-hidden); reduced motion shows the still word.
 */
export function FooterGiant() {
  const ref = useRef<HTMLDivElement>(null)
  const [glint, setGlint] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Without scroll-driven animations, run the rise once on intersection.
    if (!CSS.supports('animation-timeline: view()')) {
      const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.add('is-in'); io.disconnect() } }, { threshold: 0.2 })
      io.observe(el)
      return () => io.disconnect()
    }
  }, [])
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const on = () => { setGlint(true); clearTimeout(t); t = setTimeout(() => setGlint(false), 2600) }
    addEventListener(MARKET_EVENT, on)
    return () => { removeEventListener(MARKET_EVENT, on); clearTimeout(t) }
  }, [])
  return (
    <div ref={ref} className={`footer-giant${glint ? ' is-glint' : ''}`} aria-hidden="true">
      <Wordmark className="footer-giant-word" />
      <Wordmark className="footer-giant-word footer-giant-sheen" />
    </div>
  )
}
