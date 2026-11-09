'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * A chart's own width, so its SVG draws at 1:1 and an 11px label stays 11px on a phone (a fixed viewBox scaled
 * to 358px would shrink every label by half).
 */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e!.contentRect.width); if (w > 0) setWidth(w) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}
