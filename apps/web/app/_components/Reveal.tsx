'use client'

import { useEffect } from 'react'

/**
 * One IntersectionObserver for the whole document. Any element with
 * `data-reveal` fades/rises in the first time it enters the viewport, then is
 * left alone. CSS in globals.css owns the actual transition and the
 * reduced-motion / no-JS fallbacks; this only toggles the class.
 *
 * Mounted once in the root layout so every route gets it for free.
 */
export function Reveal() {
  useEffect(() => {
    document.documentElement.classList.remove('no-js')
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (!els.length) return

    if (
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      els.forEach((el) => el.classList.add('is-in'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    els.forEach((el) => io.observe(el))

    // Anything already on screen at load reveals on the next frame, staggered.
    requestAnimationFrame(() => {
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect()
        if (r.top < window.innerHeight) {
          window.setTimeout(() => el.classList.add('is-in'), Math.min(i, 6) * 60)
          io.unobserve(el)
        }
      })
    })

    return () => io.disconnect()
  }, [])

  return null
}
