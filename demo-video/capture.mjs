/**
 * Demo film capture rig (Phase V1).
 *
 * Captures each shot as its own webm at 2560×1440 (deviceScaleFactor 1), plus a
 * 3840×2160 pass for the four shots that push past 1.2× in the edit. Nothing is
 * ever upscaled later — a zoom in the edit is a crop of one of these.
 *
 *   node demo-video/capture.mjs                 # all shots, 1440p
 *   node demo-video/capture.mjs 01 04 08        # only these
 *   BIG=1 node demo-video/capture.mjs 01 02 08 10   # 2160p pass
 *
 * Theme: the product now defaults to dark and Francis wants the film dark
 * throughout; the Charter and Run Room use their own `cockpit` surface, which is
 * a deeper, dimmer dark — that IS the "screen dims to the cockpit" beat, no
 * light↔dark swap needed.
 */
import { chromium } from 'playwright'
import { mkdirSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE ?? 'https://marque.trade'
const BIG = process.env.BIG === '1'
const SIZE = BIG ? { width: 3840, height: 2160 } : { width: 2560, height: 1440 }
const OUT = join(process.cwd(), 'demo-video', BIG ? 'capture-2160' : 'capture-1440')
mkdirSync(OUT, { recursive: true })

const DEMO_LOAN = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

// A visible SVG pointer that follows real mouse events — a pointer, not a claim
// of human operation (the film's corner label says LIVE CAPTURE).
const CURSOR_JS = `
  (function () {
    if (document.getElementById('__cap_cursor')) return
    var c = document.createElement('div')
    c.id = '__cap_cursor'
    c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-4px 0 0 -4px;pointer-events:none;transition:transform .05s linear;'
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 2l6 15 2.6-6.4L17 8z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    document.documentElement.appendChild(c)
    window.addEventListener('mousemove', function (e) {
      c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'
    }, true)
  })();
`

/** Ease a real cursor from a→b in steps so the pointer travel reads as human. */
async function glide(page, x, y, steps = 28) {
  const cur = page.__pos ?? { x: SIZE.width / 2, y: SIZE.height / 2 }
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // easeInOutQuad
    await page.mouse.move(cur.x + (x - cur.x) * e, cur.y + (y - cur.y) * e)
    await page.waitForTimeout(12)
  }
  page.__pos = { x, y }
  await page.waitForTimeout(260)
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({
    content: `
      /* Freeze anything that would drift between takes. */
      [data-reveal]{opacity:1!important;transform:none!important}
      *,*::before,*::after{caret-color:transparent!important}
      /* grain overlay can moiré on downscale */
      body::before{opacity:0!important}
    `,
  }).catch(() => {})
  await page.addInitScript(CURSOR_JS)
  await page.evaluate(CURSOR_JS)
  await page.waitForTimeout(500)
}

/** slug -> async (page) => actions. Keep each shot longer than the edit needs. */
const SHOTS = {
  '01_funnel_collapse': async (page) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.evaluate(() => document.querySelector('[class*="stats"]')?.scrollIntoView({ behavior: 'instant', block: 'center' }))
    await page.waitForTimeout(3500)
  },
  '02_standard_fail': async (page) => {
    await page.goto(`${BASE}/standard`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) => /MCS-REB-1|failed|Synergix/i.test(n.textContent ?? '') && n.getBoundingClientRect().height < 600)
      el?.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(4000)
  },
  '03_positions_read': async (page) => {
    await page.goto(`${BASE}/positions`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    const box = await page.locator('input[type="text"], input:not([type])').first().boundingBox()
    if (box) {
      await glide(page, box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.keyboard.type(DEMO_LOAN, { delay: 38 })
    }
    const btn = await page.getByRole('button', { name: /read chain/i }).boundingBox()
    if (btn) { await glide(page, btn.x + btn.width / 2, btn.y + btn.height / 2); await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2) }
    await page.waitForTimeout(6500)
  },
  '04_marketplace_sort': async (page) => {
    await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.evaluate(() => document.querySelector('[class*="rows"], [class*="mktRow"]')?.scrollIntoView({ behavior: 'instant', block: 'start' }))
    await page.waitForTimeout(800)
    const chip = await page.getByRole('button', { name: /^Warranted$/ }).boundingBox().catch(() => null)
    if (chip) { await glide(page, chip.x + chip.width / 2, chip.y + chip.height / 2); await page.mouse.click(chip.x + chip.width / 2, chip.y + chip.height / 2) }
    await page.waitForTimeout(3000)
  },
  '05_marketplace_dedupe': async (page) => {
    await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a,button,span')].find((n) => /registered identities/i.test(n.textContent ?? ''))
      el?.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(3500)
  },
  '06_compare': async (page) => {
    await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    const btns = await page.getByRole('button', { name: /^Compare$/ }).all()
    for (const b of btns.slice(0, 2)) {
      const bb = await b.boundingBox(); if (!bb) continue
      await glide(page, bb.x + bb.width / 2, bb.y + bb.height / 2)
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2)
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(1400)
    const go = await page.getByRole('link', { name: /Compare \d/ }).boundingBox().catch(() => null)
    if (go) { await glide(page, go.x + go.width / 2, go.y + go.height / 2); await page.mouse.click(go.x + go.width / 2, go.y + go.height / 2); await page.waitForLoadState('domcontentloaded') }
    await settle(page)
    await page.waitForTimeout(3000)
  },
  '07_standard_pass_fail': async (page) => {
    await page.goto(`${BASE}/standard`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.waitForTimeout(4500)
  },
  '08_charter_grant': async (page) => {
    await page.goto(`${BASE}/app/charter?agent=marque:bound&category=rebalancing`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.waitForTimeout(7000) // the cockpit composes the charter line by line
  },
  '09_run_room': async (page) => {
    await page.goto(`${BASE}/runs`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.waitForTimeout(4500)
  },
  '10_ledger': async (page) => {
    await page.goto(`${BASE}/ledger`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.evaluate(() => document.querySelector('[class*="experiment"], [class*="expRow"]')?.scrollIntoView({ behavior: 'instant', block: 'center' }))
    await page.waitForTimeout(4000)
  },
  '11_pancake_proof': async (page) => {
    await page.goto(`${BASE}/pancakeswap/proof`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) => /0xb32c204f/i.test(n.textContent ?? ''))
      el?.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
    await page.waitForTimeout(4500)
  },
  '12_api': async (page) => {
    await page.goto(`${BASE}/api/v1/funnel`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
  },
}

const PUSH_SHOTS = new Set(['01_funnel_collapse', '02_standard_fail', '08_charter_grant', '10_ledger'])

async function run() {
  const want = process.argv.slice(2)
  const list = Object.keys(SHOTS).filter((k) => want.length === 0 || want.some((w) => k.startsWith(w) || k.includes(w)))
  if (BIG) {
    const skipped = list.filter((k) => !PUSH_SHOTS.has(k))
    if (skipped.length) console.log(`(BIG pass: skipping non-push shots ${skipped.join(', ')})`)
  }
  const finalList = BIG ? list.filter((k) => PUSH_SHOTS.has(k)) : list

  for (const slug of finalList) {
    const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] })
    const ctx = await browser.newContext({
      viewport: SIZE,
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
      recordVideo: { dir: OUT, size: SIZE },
    })
    const page = await ctx.newPage()
    page.__pos = { x: SIZE.width / 2, y: SIZE.height / 2 }
    // Force the dark theme regardless of any stored pref.
    await page.addInitScript(() => { try { localStorage.setItem('marque-theme', 'dark') } catch {} })
    console.log(`▶ ${slug}${BIG ? ' (2160)' : ''}`)
    try {
      await SHOTS[slug](page)
    } catch (e) {
      console.log(`  ! ${slug}: ${String(e).split('\n')[0]}`)
    }
    await ctx.close() // flushes the video
    await browser.close()
    // rename the auto-named webm to the slug
    const vids = readdirSync(OUT).filter((f) => f.endsWith('.webm') && !/^\d\d_/.test(f))
    if (vids[0]) renameSync(join(OUT, vids[0]), join(OUT, `${slug}.webm`))
    console.log(`  ✓ ${slug}.webm`)
  }
  console.log(`\nAll takes in ${OUT}`)
}

run()
