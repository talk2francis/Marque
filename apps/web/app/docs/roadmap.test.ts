import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROADMAP } from './whitepaper'

/** ROADMAP-NEXT 6.3: every Live item links to a page that exists in the app (a route that cannot 404 by construction). */
const APP = resolve(__dirname, '..')
function routeExists(href: string): boolean {
  const segs = href.split(/[?#]/)[0]!.split('/').filter(Boolean)
  let dir = APP
  for (const seg of segs) {
    if (existsSync(join(dir, seg))) { dir = join(dir, seg); continue }
    const dyn = readdirSync(dir, { withFileTypes: true }).find((d) => d.isDirectory() && /^\[[^.\]]+\]$/.test(d.name))
    if (!dyn) return false
    dir = join(dir, dyn.name)
  }
  return existsSync(join(dir, 'page.tsx')) || existsSync(join(dir, 'route.ts'))
}

describe('roadmap', () => {
  const live = ROADMAP.find((h) => h.key === 'shipped')!
  it('links every Live item to a page', () => {
    for (const it of live.items) expect(it.href, it.title).toBeTruthy()
  })
  it.each(live.items.map((i) => [i.title, i.href!]))('%s resolves to a route (%s)', (_t, href) => {
    expect(routeExists(href)).toBe(true)
  })
  it('gives every Next outcome a measurable exit', () => {
    for (const it of ROADMAP.find((h) => h.key === 'next')!.items) expect(it.exit, it.title).toMatch(/^Ships when /)
  })
  it('keeps the copy free of em and en dashes', () => {
    expect(JSON.stringify(ROADMAP)).not.toMatch(/[–—]/)
  })
})
