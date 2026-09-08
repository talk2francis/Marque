/**
 * Render each motion-graphic card in demo-video/cards.html to its own webm.
 * These carry the DATA (the funnel, "Passes: 0", the proof numbers) as clean
 * animated typography on the brand ground — v1's mistake was filming web pages
 * for everything and slow-zooming, which looked monotonous.
 *
 *   node demo-video/render-cards.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = join(process.cwd(), 'demo-video', 'cards')
mkdirSync(OUT, { recursive: true })
const CARDS = pathToFileURL(join(process.cwd(), 'demo-video', 'cards.html')).href

// scene -> capture seconds (a touch longer than the animation needs; the edit trims)
const SCENES = {
  open: 6.5,
  funnel: 9.0,
  zero: 7.5,
  title: 5.5,
  standard: 8.0,
  proof: 8.5,
  close: 7.0,
}

const run = async () => {
  for (const [s, secs] of Object.entries(SCENES)) {
    const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] })
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
    })
    const page = await ctx.newPage()
    console.log(`▶ ${s} (${secs}s)`)
    await page.goto(`${CARDS}?s=${s}`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    // the CSS animations begin at page load; hold for the scene length
    await page.waitForTimeout(secs * 1000)
    await ctx.close()
    await browser.close()
    const vids = readdirSync(OUT).filter((f) => f.endsWith('.webm') && !Object.keys(SCENES).some((k) => f.startsWith(k)))
    if (vids[0]) renameSync(join(OUT, vids[0]), join(OUT, `${s}.webm`))
    console.log(`  ✓ ${s}.webm`)
  }
  console.log(`\nCards in ${OUT}`)
}
run()
