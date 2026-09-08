'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A number that counts up to its value the first time it scrolls into view.
 *
 * The server renders the real figure, so no-JS and crawlers see the truth. On
 * the client, if motion is allowed and the element is not yet on screen, it
 * starts at zero and eases up once; otherwise it just shows the value. It never
 * invents a number — `value` is passed in, already measured.
 */
export function CountUp({
  value,
  className,
  durationMs = 1100,
}: {
  value: number | null
  className?: string
  durationMs?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState<number | null>(value)
  const done = useRef(false)

  useEffect(() => {
    if (value === null || done.current) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setDisplay(value)
      done.current = true
      return
    }

    const el = ref.current
    if (!el) return

    const run = () => {
      if (done.current) return
      done.current = true
      const start = performance.now()
      const from = 0
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs)
        // easeOutExpo — fast then a long settle, the "counter landing" feel
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
        setDisplay(Math.round(from + (value - from) * eased))
        if (t < 1) requestAnimationFrame(tick)
        else setDisplay(value)
      }
      requestAnimationFrame(tick)
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            run()
            io.disconnect()
          }
        }
      },
      { threshold: 0.4 },
    )
    // If it is already on screen at mount, animate from zero right away.
    setDisplay(0)
    io.observe(el)
    return () => io.disconnect()
  }, [value, durationMs])

  return (
    <span ref={ref} className={className}>
      {display === null ? '—' : display.toLocaleString('en-US')}
    </span>
  )
}
