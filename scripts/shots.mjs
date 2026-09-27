/**
 * Screenshot loop for design work (P2-07 onward).
 *
 *   node scripts/shots.mjs <outDir> [--base=http://127.0.0.1:3200] [--widths=390,768,1440]
 *        [--themes=night,day] [--routes=/,/register] [--full]
 *
 * The theme is written to localStorage before any page script runs, so the
 * bootstrap paints it on the first frame, exactly as a returning visitor sees it.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? true]
}))
const OUT = process.argv[2]
if (!OUT) { console.error('usage: shots.mjs <outDir> [...]'); process.exit(2) }
const BASE = args.base ?? 'https://marque.trade'
const WIDTHS = String(args.widths ?? '390,768,1440').split(',').map(Number)
const THEMES = String(args.themes ?? 'night,day').split(',')
const DEFAULT_ROUTES = [
  '/', '/register', '/register/yield', '/agents/sluicegate', '/compare', '/positions', '/pancakeswap',
  '/pancakeswap/proof', '/me', '/builders/claim', '/builders/test', '/docs', '/standard', '/ledger',
  '/ledger/methodology', '/receipts/latest', '/status', '/judge', '/app/charter', '/app/charters',
  '/protocol', '/_ui', '/jobs/56/56810',
]
const ROUTES = args.routes ? String(args.routes).split(',') : DEFAULT_ROUTES
const HEIGHTS = { 390: 844, 768: 1024, 1440: 900 }
mkdirSync(OUT, { recursive: true })

const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[/?=&]/g, '_'))

const browser = await chromium.launch()
const errors = []
for (const theme of THEMES) {
  for (const w of WIDTHS) {
    // Full-page captures never scroll, so scroll-driven reveals would be caught mid-animation: reduce motion.
    const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHTS[w] ?? 900 }, deviceScaleFactor: 1, reducedMotion: args.full ? 'reduce' : 'no-preference' })
    await ctx.addInitScript((t) => { try { localStorage.setItem('marque-theme', t) } catch { /* storage refused in this context */ } }, theme)
    const page = await ctx.newPage()
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${theme} ${w} ${page.url()}: ${m.text().slice(0, 200)}`) })
    page.on('pageerror', (e) => errors.push(`${theme} ${w} ${page.url()}: PAGEERROR ${e.message.slice(0, 200)}`))
    for (const r of ROUTES) {
      try {
        const res = await page.goto(BASE + r, { waitUntil: args.load ?? 'networkidle', timeout: 45000 }).catch(() => null)
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 3000))]))
        await page.waitForTimeout(Number(args.wait ?? 900))
        // Reveal everything that animates in on scroll, so full-page shots are complete.
        await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((n) => n.setAttribute('data-in', '')))
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        const file = join(OUT, `${slug(r)}.${w}.${theme}.png`)
        await page.screenshot({ path: file, fullPage: !!args.full })
        console.log(`${res?.status() ?? 'ERR'} ${overflow > 0 ? `HSCROLL+${overflow}` : 'ok'} ${file}`)
      } catch (e) { console.log(`FAIL ${r} ${w} ${theme} ${e.message.split('\n')[0]}`) }
    }
    await ctx.close()
  }
}
await browser.close()
if (errors.length) { console.log(`\nconsole errors (${errors.length}):`); for (const e of [...new Set(errors)].slice(0, 60)) console.log('  ' + e) }
