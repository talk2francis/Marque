'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { buildSurface, drawSurface, type FacetSurface } from './facet-light'

/**
 * The ground behind the pages (DESIGN-V4 6, redrawn 28 Oct as faceted light): a large low-poly surface with no
 * outlines, each facet shaded only by how it meets one slow light (facet-light.ts). It carries no information and
 * stays within a few percent of the ground, fading across the reading column. Not on the landing page, whose hero is
 * its own picture. Reference-agent mastheads clear the field above their lower edge so their artwork stays intact.
 *
 * Budget: 12 fps (the light turns once in four minutes, so more frames add nothing), device pixel ratio at most 1.5,
 * paused when hidden or under a modal, and a single still frame for reduced motion, save-data or a profile's Calm
 * preference. It paints above the body's ground because the body is its own stacking context (UI base styles).
 */
const FPS = 12

/** Per-route strength: full on editorial pages, lighter on working pages, none on the landing page, tables and overlays. */
function densityFor(path: string): number {
  if (path === '/') return 0
  if (path.startsWith('/quest') || path.startsWith('/builders') || path.startsWith('/docs')) return 1
  if (path.startsWith('/status') || path.startsWith('/standard') || path.startsWith('/badge')) return 0
  return 0.75
}

function rgbOf(value: string, fallback: [number, number, number]): [number, number, number] {
  const m = value.trim().match(/^#([0-9a-f]{6})$/i)
  if (!m) return fallback
  const v = parseInt(m[1]!, 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

export function FacetField() {
  const ref = useRef<HTMLCanvasElement>(null)
  const path = usePathname()
  const density = densityFor(path)
  // Created after first paint, when the browser is idle: never on the critical path.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) { w.requestIdleCallback(() => setReady(true), { timeout: 3000 }); return }
    const t = setTimeout(() => setReady(true), 1200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!ready || !canvas || density === 0) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches || nav.connection?.saveData === true || document.documentElement.dataset['motion'] === 'calm'
    let surface: FacetSurface | null = null
    let w = 0, h = 0, raf = 0, last = 0, running = true
    const start = performance.now() - Math.random() * 240_000 // each visit meets the light somewhere else

    // Only the six branded reference storefronts carry this marker. Clip the fixed
    // field in viewport coordinates: clear above the masthead, visible below it.
    const clipHero = () => {
      const hero = document.querySelector('[data-agent-brand-hero]')
      const bottom = hero ? Math.max(0, Math.ceil(hero.getBoundingClientRect().bottom)) : 0
      const clip = bottom > 0 ? `inset(${bottom}px 0 0)` : ''
      if (canvas.style.clipPath !== clip) {
        canvas.style.clipPath = clip
        canvas.toggleAttribute('data-hero-clear', bottom > 0)
        canvas.style.setProperty('--facet-hero-bottom', `${bottom}px`)
      }
    }

    const build = () => {
      const dpr = Math.min(1.5, devicePixelRatio || 1)
      w = innerWidth; h = innerHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      surface = buildSurface(w, h)
    }
    const draw = (now: number) => {
      if (!surface) return
      clipHero()
      const css = getComputedStyle(document.documentElement)
      const day = document.documentElement.dataset['theme'] !== 'night'
      ctx.clearRect(0, 0, w, h)
      drawSurface(ctx, surface, (now - start) / 1000, {
        ink: rgbOf(css.getPropertyValue('--ink'), day ? [21, 22, 15] : [232, 233, 224]),
        glint: rgbOf(css.getPropertyValue('--brass-lit'), [217, 174, 69]),
        // Raised twice on 29 Oct (owner: clearly visible, still off on the landing page); the reading column fades it.
        strength: density * (day ? 5 : 8),
        day,
      })
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (!running || now - last < 1000 / FPS) return
      last = now
      draw(now)
    }
    const visibility = () => { running = !document.hidden && !document.querySelector('[aria-modal="true"]') }
    const resize = () => { build(); draw(performance.now()) }
    const retheme = () => draw(performance.now())

    build()
    draw(performance.now())
    addEventListener('resize', resize)
    addEventListener('marque:theme', retheme)
    addEventListener('scroll', clipHero, { passive: true })
    const layout = new ResizeObserver(clipHero)
    layout.observe(document.body)
    const cleanup = () => {
      layout.disconnect()
      removeEventListener('scroll', clipHero)
      removeEventListener('resize', resize)
      removeEventListener('marque:theme', retheme)
    }
    if (still) return cleanup
    raf = requestAnimationFrame(loop)
    const mo = new MutationObserver(visibility)
    mo.observe(document.body, { childList: true })
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelAnimationFrame(raf); mo.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      cleanup()
    }
  }, [density, ready, path])

  if (density === 0 || !ready) return null
  return <canvas ref={ref} className="facet-field" aria-hidden="true" />
}
