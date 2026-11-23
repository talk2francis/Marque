import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Next.js refuses to route at all when two sibling dynamic segments have different names (for example
 * img/agent/[chainId] beside img/agent/[chain]). `next build` does not catch it; the server fails every request at
 * runtime (23 Nov 2026: a release failed its health check this way). This fails CI instead.
 */
const APP = path.join(__dirname)
const dynamicName = (s: string) => /^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/.exec(s)?.[1] ?? null

function walk(dir: string, problems: string[]) {
  const dirs = readdirSync(dir).filter((d) => !d.startsWith('.') && d !== 'node_modules' && statSync(path.join(dir, d)).isDirectory())
  // Route groups "(x)" and parallel routes "@x" do not add a URL segment: their children are siblings of this level.
  const segments: string[] = []
  const collect = (d: string, base: string) => {
    for (const x of readdirSync(path.join(base, d)).filter((y) => statSync(path.join(base, d, y)).isDirectory())) {
      if (/^\(.*\)$/.test(x) || x.startsWith('@')) collect(x, path.join(base, d))
      else segments.push(x)
    }
  }
  for (const d of dirs) {
    if (/^\(.*\)$/.test(d) || d.startsWith('@')) collect(d, dir)
    else segments.push(d)
  }
  const dyn = [...new Set(segments.map(dynamicName).filter((n): n is string => n !== null))]
  if (dyn.length > 1) problems.push(`${path.relative(APP, dir) || '.'}: ${dyn.join(' vs ')}`)
  for (const d of dirs) walk(path.join(dir, d), problems)
}

describe('app route tree', () => {
  it('never has two differently named dynamic segments at the same level', () => {
    const problems: string[] = []
    walk(APP, problems)
    expect(problems).toEqual([])
  })
})
