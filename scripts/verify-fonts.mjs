/**
 * P2-07 font check: the computed font-family of each role, which faces the browser actually
 * loaded, and every font file the page requested.
 *   node scripts/verify-fonts.mjs [base] [route]
 */
import { chromium } from 'playwright'
const base = process.argv[2] ?? 'https://marque.trade'
const route = process.argv[3] ?? '/_ui'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const fontFiles = []
p.on('response', (r) => { if (/\.woff2?(\?|$)/.test(r.url())) fontFiles.push(`${r.status()} ${r.url().replace(base, '')}`) })
await p.goto(base + route, { waitUntil: 'networkidle', timeout: 90000 })
await p.evaluate(() => document.fonts.ready)
const out = await p.evaluate(() => {
  const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return { sel, family: s.fontFamily.split(',').slice(0, 2).join(','), weight: s.fontWeight, size: s.fontSize } }
  const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`)
  return {
    roles: [pick('body'), pick('h1'), pick('.t-display'), pick('.statement'), pick('.nav-link'), pick('.btn'), pick('.addr-text'), pick('.t-label')],
    loaded: [...new Set(loaded)],
    check: {
      sans: document.fonts.check('500 16px "General Sans"') || [...document.fonts].some((f) => /generalSans|General Sans/i.test(f.family) && f.status === 'loaded'),
    },
  }
})
console.log(JSON.stringify({ route, ...out, fontFiles }, null, 2))
await b.close()
