'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * The Facet field (DESIGN-V4 6, invariant 38): faceted light behind the page. A low-poly lattice whose vertices drift
 * on slow sine waves, with one facet catching champagne light every 9 to 14 s (25 Oct: raised so it is seen). Ambient only: it carries no information,
 * except that a real indexed hire or settlement during the visit lights one extra facet near the top right.
 *
 * Budget: 24 fps cap, device pixel ratio at most 1.5, paused when hidden or under a modal, and a single static frame
 * for reduced motion, save-data, or a coarse pointer under 768 px.
 */
export const PULSE_EVENT = 'marque:pulse-new'
const COL = 160, ROW = 140, FPS = 24

/** Per-route density (DESIGN-V4 6): full on the editorial pages, half on working pages, none on tables and overlays. */
function densityFor(path: string): number {
  if (path === '/' || path.startsWith('/quest') || path.startsWith('/builders') || path.startsWith('/docs')) return 1
  if (path.startsWith('/status') || path.startsWith('/standard') || path.startsWith('/badge')) return 0
  return 0.5
}

interface Vertex { x: number; y: number; ax: number; ay: number; px: number; py: number; tx: number; ty: number }
interface Light { tri: number; start: number; peak: number }

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
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches || nav.connection?.saveData === true || (matchMedia('(pointer: coarse)').matches && innerWidth < 768)
    let w = 0, h = 0, cols = 0, rows = 0
    let verts: Vertex[] = []
    let tris: Array<[number, number, number]> = []
    const lights: Light[] = []
    let raf = 0, last = 0, nextLight = 0, running = true

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    const build = () => {
      const dpr = Math.min(1.5, devicePixelRatio || 1)
      w = innerWidth; h = innerHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / COL) + 3; rows = Math.ceil(h / ROW) + 3
      verts = []
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // Periods 40 to 70 s, amplitude 6 to 14 px, a random phase per vertex.
        verts.push({ x: (c - 1) * COL + (r % 2 ? COL / 2 : 0), y: (r - 1) * ROW, ax: rnd(6, 14), ay: rnd(6, 14), px: rnd(0, Math.PI * 2), py: rnd(0, Math.PI * 2), tx: rnd(40, 70), ty: rnd(40, 70) })
      }
      tris = []
      lights.length = 0
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const i = r * cols + c, right = i + 1, down = i + cols, diag = i + cols + 1
        if (r % 2 === 0) { tris.push([i, right, down]); tris.push([right, diag, down]) } else { tris.push([i, right, diag]); tris.push([i, diag, down]) }
      }
    }
    const pos = (v: Vertex, t: number): [number, number] => [v.x + Math.sin((t / v.tx) * Math.PI * 2 + v.px) * v.ax, v.y + Math.sin((t / v.ty) * Math.PI * 2 + v.py) * v.ay]
    const css = getComputedStyle(document.documentElement)
    const ink = css.getPropertyValue('--ink').trim() || '#15160F'
    const brass = css.getPropertyValue('--brass-lit').trim() || '#D9AE45'
    const day = () => document.documentElement.dataset['theme'] !== 'night'
    const alphaOf = (l: Light, now: number) => {
      // Ease in over 1.2 s, hold briefly, ease out over 3.5 s.
      const t = now - l.start
      if (t < 0) return 0
      if (t < 1200) return l.peak * (t / 1200)
      if (t < 1700) return l.peak
      return Math.max(0, l.peak * (1 - (t - 1700) / 3500))
    }

    const draw = (now: number) => {
      const t = now / 1000
      ctx.clearRect(0, 0, w, h)
      const P = verts.map((v) => pos(v, still ? 0 : t))
      for (const l of lights) {
        const a = alphaOf(l, now)
        if (a <= 0) continue
        // A light can outlive the lattice it was lit on (a resize rebuilds it): skip any index that no longer exists.
        const tri = tris[l.tri]
        if (!tri) continue
        const [i, j, k] = tri
        const a1 = P[i], b1 = P[j], c1 = P[k]
        if (!a1 || !b1 || !c1) continue
        ctx.beginPath(); ctx.moveTo(...a1); ctx.lineTo(...b1); ctx.lineTo(...c1); ctx.closePath()
        ctx.globalAlpha = a * density; ctx.fillStyle = brass; ctx.fill()
      }
      ctx.globalAlpha = (day() ? 0.085 : 0.075) * density
      ctx.strokeStyle = ink; ctx.lineWidth = 1
      ctx.beginPath()
      for (const [i, j, k] of tris) { const a1 = P[i], b1 = P[j], c1 = P[k]; if (!a1 || !b1 || !c1) continue; ctx.moveTo(...a1); ctx.lineTo(...b1); ctx.lineTo(...c1); ctx.lineTo(...a1) }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    const light = (now: number, nearTopRight = false) => {
      if (!tris.length) return
      let tri = Math.floor(Math.random() * tris.length)
      if (nearTopRight) {
        const target = Math.max(0, cols - 3) // second row, near the right edge
        tri = Math.min(tris.length - 1, (cols - 1) * 2 + target * 2)
      }
      lights.push({ tri, start: now, peak: 0.085 })
      while (lights.length > 4) lights.shift()
    }
    const onPulse = () => light(performance.now(), true)

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (!running || now - last < 1000 / FPS) return
      last = now
      if (now > nextLight) { light(now); nextLight = now + rnd(9_000, 14_000) }
      draw(now)
    }
    const visibility = () => {
      // Hidden tab, or a modal or sheet over the page: stop drawing.
      running = !document.hidden && !document.querySelector('[aria-modal="true"]')
    }
    const resize = () => { build(); if (still) draw(0) }

    build()
    if (still) { draw(0); addEventListener('resize', resize); return () => removeEventListener('resize', resize) }
    nextLight = performance.now() + rnd(2500, 5000)
    raf = requestAnimationFrame(loop)
    const mo = new MutationObserver(visibility)
    mo.observe(document.body, { childList: true, subtree: false, attributes: false })
    document.addEventListener('visibilitychange', visibility)
    addEventListener('resize', resize)
    addEventListener(PULSE_EVENT, onPulse)
    return () => {
      cancelAnimationFrame(raf); mo.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      removeEventListener('resize', resize); removeEventListener(PULSE_EVENT, onPulse)
    }
  }, [density, ready])

  if (density === 0 || !ready) return null
  return <canvas ref={ref} className="facet-field" aria-hidden="true" />
}
