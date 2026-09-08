/**
 * P12 submission screenshots.
 *
 * Writes PNGs to docs/evidence/shots/. Not a test — it captures the pages a
 * judge is pointed at, at a fixed viewport, light theme (the default a judge
 * lands on) plus a dark pass for the hero.
 *
 *   node scripts/p12-shots.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE ?? 'https://marque.trade'
const OUT = join(process.cwd(), 'docs/evidence/shots')
mkdirSync(OUT, { recursive: true })

// A BSC address with real V3 + Venus exposure, used across the demo.
const DEMO_ADDR = process.env.DEMO_ADDR ?? '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3'

/** [slug, path, {full?, theme?, wait?, prep?}] */
const SHOTS = [
  ['01-home-light', '/', { full: true }],
  ['02-home-dark', '/', { full: true, theme: 'dark' }],
  ['03-marketplace-warranted-top', '/register', { full: true, wait: 2500 }],
  ['04-standard', '/standard', { full: true }],
  ['05-pancake-proof', '/pancakeswap/proof', { full: true }],
  ['06-positions', `/positions?address=${DEMO_ADDR}`, { full: true, wait: 6000 }],
  ['07-ledger', '/ledger', { full: true }],
  ['08-status', '/status', { full: true, wait: 2000 }],
  ['09-judge', '/judge', { full: true }],
  ['10-charter-desk', '/app/charter', { full: true, wait: 2000 }],
  ['11-docs', '/docs', { full: false }],
]

const shot = async (page, slug, path, opts = {}) => {
  const url = BASE + path
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    if (opts.theme) {
      await page.evaluate((t) => {
        try { localStorage.setItem('marque-theme', t) } catch {}
        document.documentElement.setAttribute('data-theme', t)
      }, opts.theme)
      await page.waitForTimeout(400)
    }
    await page.waitForTimeout(opts.wait ?? 1200)
    const file = join(OUT, `${slug}.png`)
    await page.screenshot({ path: file, fullPage: !!opts.full })
    console.log(`  ok   ${slug}  <-  ${path}`)
  } catch (e) {
    console.log(`  FAIL ${slug}  <-  ${path}  (${e.message.split('\n')[0]})`)
  }
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  })
  const page = await ctx.newPage()
  console.log(`P12 shots -> ${OUT}\n`)
  for (const [slug, path, opts] of SHOTS) await shot(page, slug, path, opts)
  await browser.close()
  console.log('\ndone')
}
run()
