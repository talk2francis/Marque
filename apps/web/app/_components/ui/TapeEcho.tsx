'use client'
import { useEffect, useRef } from 'react'

/**
 * The ticker's second copy, for a seamless loop, made in the browser from the first: the page itself lists each event
 * once (V4.2 L0, a reader saw every row twice). Hidden from assistive technology and inert.
 */
export function TapeEcho() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    const track = el?.parentElement
    if (!el || !track) return
    for (const node of Array.from(track.children)) {
      if (node === el) continue
      const copy = node.cloneNode(true) as HTMLElement
      copy.setAttribute('aria-hidden', 'true'); copy.setAttribute('tabindex', '-1'); copy.setAttribute('inert', '')
      el.appendChild(copy)
    }
    return () => { el.replaceChildren() }
  }, [])
  return <span ref={ref} aria-hidden="true" style={{ display: 'contents' }} />
}
