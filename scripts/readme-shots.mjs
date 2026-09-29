/**
 * The README's screenshots (29 Sep): one hero and six pages, nothing else.
 *
 *   node scripts/readme-shots.mjs [--base=https://marque.trade]
 *
 * Viewport captures at 1440x900, 2x, saved as WebP in docs/evidence/readme/. Each page is
 * scrolled through once first so content-visibility sections and scroll reveals have
 * rendered, then returned to the top: a full-page capture would show them blank.
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { join } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const BASE = args.base ?? 'https://marque.trade'
const OUT = join(new URL('..', import.meta.url).pathname, 'docs/evidence/readme')

const SHOTS = [
  { name: 'hero', route: '/', theme: 'night', width: 1800 },
  { name: 'home', route: '/', theme: 'day' },
  { name: 'marketplace', route: '/register', theme: 'night', scrollTo: 330 },
  { name: 'storefront', route: '/agents/keel', theme: 'night' },
  { name: 'hire', route: '/agents/sluicegate?hire=56%3A0x8004a169fb4a3325136eb29fa0ceb6d2e539a432%3A341555', theme: 'day', wait: 2500 },
  { name: 'quest', route: '/quest', theme: 'night' },
  { name: 'job', route: '/jobs/56/56843', theme: 'day' },
]

const browser = await chromium.launch()
for (const s of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await ctx.addInitScript((t) => { try { localStorage.setItem('marque-theme', t) } catch { /* no storage */ } }, s.theme)
  const page = await ctx.newPage()
  await page.goto(BASE + s.route, { waitUntil: 'networkidle', timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += 800) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(120) }
  await page.evaluate((y) => window.scrollTo(0, y), s.scrollTo ?? 0)
  await page.waitForTimeout(s.wait ?? 1200)
  const png = await page.screenshot()
  const file = join(OUT, `${s.name}.webp`)
  await sharp(png).resize({ width: s.width ?? 1600 }).webp({ quality: 82, effort: 6 }).toFile(file)
  console.log(file)
  await ctx.close()
}
await browser.close()
