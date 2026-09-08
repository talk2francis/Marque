/**
 * The 4 held product shots for the film v2. No cursor theatrics, no zoom —
 * load, wait for the real content, hold dead still for 5.5s. The edit adds at
 * most a 1.02x imperceptible drift. These are the only places the film shows
 * the actual product; the data lives on the cards.
 */
import { chromium } from 'playwright'
import { mkdirSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE ?? 'https://marque.trade'
const OUT = join(process.cwd(), 'demo-video', 'shots2')
mkdirSync(OUT, { recursive: true })
const RUN_ID = process.env.RUN_ID ?? 'c89d35ac-28c8-4bd7-b307-3b25a81f080c'

const HOLD = 5.5

const FREEZE = `
  [data-reveal]{opacity:1!important;transform:none!important}
  *,*::before,*::after{animation-play-state:paused!important;caret-color:transparent!important}
  body::before{opacity:0!important}
  .marque-loading-screen{display:none!important}
`

async function ready(page, sel) {
  await page.waitForSelector(sel, { state: 'visible', timeout: 30000 }).catch(() => {})
  await page.waitForFunction(() => !document.querySelector('.marque-loading-screen'), { timeout: 30000 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.addStyleTag({ content: FREEZE }).catch(() => {})
  await page.waitForTimeout(600)
}

const SHOTS = {
  // /positions: an address read from chain, the Venus health-factor bar
  s_positions: async (page) => {
    await page.goto(`${BASE}/positions?addr=0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf`, { waitUntil: 'domcontentloaded' })
    await ready(page, 'text=/health factor|Health factor|HF/i')
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) => /health factor/i.test(n.textContent ?? '') && n.getBoundingClientRect().height < 400)
      el?.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(HOLD * 1000)
  },
  // /standard: the fail card, six fields
  s_standardfail: async (page) => {
    await page.goto(`${BASE}/standard`, { waitUntil: 'domcontentloaded' })
    await ready(page, 'text=/MCS-REB-1/')
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) => /a pass and a fail|Results so far|most-missed/i.test(n.textContent ?? '') && n.getBoundingClientRect().height < 700)
      el?.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(HOLD * 1000)
  },
  // /app/charter: the may / may-not columns — the one cockpit moment
  s_charter: async (page) => {
    await page.goto(`${BASE}/app/charter?agent=marque:bound&category=rebalancing`, { waitUntil: 'domcontentloaded' })
    await ready(page, 'text=/may not/')
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) => /Bound may not|may not/i.test(n.textContent ?? '') && n.getBoundingClientRect().height < 600)
      el?.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(HOLD * 1000)
  },
  // /pancakeswap/proof: the transactions list with real hashes
  s_proofpage: async (page) => {
    await page.goto(`${BASE}/pancakeswap/proof`, { waitUntil: 'domcontentloaded' })
    await ready(page, 'text=/0xb32c204f/')
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) => /The transactions/i.test(n.textContent ?? ''))
      el?.scrollIntoView({ behavior: 'instant', block: 'start' })
    })
    await page.waitForTimeout(HOLD * 1000)
  },
  // run room: the timeline of one hire
  s_runroom: async (page) => {
    await page.goto(`${BASE}/runs/${RUN_ID}`, { waitUntil: 'domcontentloaded' })
    await ready(page, 'text=/Receipt/')
    await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' }))
    await page.waitForTimeout(HOLD * 1000)
  },
}

const run = async () => {
  const want = process.argv.slice(2)
  for (const [slug, fn] of Object.entries(SHOTS)) {
    if (want.length && !want.some((w) => slug.includes(w))) continue
    const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] })
    const ctx = await browser.newContext({
      viewport: { width: 2560, height: 1440 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      recordVideo: { dir: OUT, size: { width: 2560, height: 1440 } },
    })
    const page = await ctx.newPage()
    await page.addInitScript(() => { try { localStorage.setItem('marque-theme', 'dark') } catch {} })
    console.log(`▶ ${slug}`)
    try { await fn(page) } catch (e) { console.log(`  ! ${e.message.split('\n')[0]}`) }
    await ctx.close()
    await browser.close()
    const v = readdirSync(OUT).filter((f) => f.endsWith('.webm') && !f.startsWith('s_'))
    if (v[0]) renameSync(join(OUT, v[0]), join(OUT, `${slug}.webm`))
    console.log(`  ✓ ${slug}.webm`)
  }
}
run()
