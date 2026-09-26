'use client'
import { useEffect } from 'react'

/** Marks the header once the page has scrolled, so it can firm up. Renders nothing. */
export function HeaderScroll() {
  useEffect(() => {
    const h = document.querySelector('.site-header')
    if (!h) return
    let raf = 0
    const read = () => { raf = 0; h.toggleAttribute('data-scrolled', window.scrollY > 8) }
    const on = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', on, { passive: true })
    return () => { window.removeEventListener('scroll', on); if (raf) cancelAnimationFrame(raf) }
  }, [])
  return null
}
