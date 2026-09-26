/**
 * P2-08 acceptance: a fresh wallet completes all four hires and ratings from /quest without
 * leaving it, every step ticking from the chain, recorded on video.
 *
 *   node scripts/p2-08-accept.mjs --wallet=/root/.marque/test-wallets/p2-08-desktop.json [--width=1440]
 *        [--base=https://marque.trade] [--out=docs/phase2/evidence] [--dry]
 *
 * The browser is real (Chromium, the production pages, RainbowKit's Connect). The wallet is
 * headless-wallet.mjs: the key stays in Node and signs exactly what the page asks for.
 * --dry stops before the first signature.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { attachWallet, connectInPage } from './headless-wallet.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const BASE = args.base ?? 'https://marque.trade'
const WIDTH = Number(args.width ?? 1440)
const OUT = args.out ?? 'docs/phase2/evidence'
const TAG = WIDTH < 600 ? 'mobile-390' : 'desktop-1440'
const { privateKey } = JSON.parse(readFileSync(args.wallet, 'utf8'))
const CATS = [
  { key: 'yield', row: 'Yield' },
  { key: 'grid', row: 'Grid' },
  { key: 'rebalancing', row: 'Rebalancing' },
  { key: 'health_factor', row: 'Health factor' },
]

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const videoDir = join(OUT, `.video-${TAG}`)
mkdirSync(videoDir, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: WIDTH < 600 ? 844 : 900 },
  deviceScaleFactor: WIDTH < 600 ? 2 : 1,
  recordVideo: { dir: videoDir, size: { width: WIDTH, height: WIDTH < 600 ? 844 : 900 } },
})
await ctx.addInitScript(() => { try { localStorage.setItem('marque-theme', 'night') } catch { /* no storage */ } })
const { address } = await attachWallet(ctx, { privateKey, log: (m) => log('wallet', m) })
const page = await ctx.newPage()
page.on('pageerror', (e) => log('PAGEERROR', e.message.slice(0, 200)))
const evidence = { base: BASE, width: WIDTH, wallet: address, startedAt: new Date().toISOString(), hires: [] }
const shot = (n) => page.screenshot({ path: join(OUT, `p2-08-${TAG}-${n}.png`) }).catch(() => {})

async function rowFor(name) { return page.locator('.qt-row').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) }) }

try {
  await page.goto(`${BASE}/quest`, { waitUntil: 'networkidle', timeout: 90000 })
  await connectInPage(page)
  await page.waitForTimeout(3000)
  await shot('0-connected')
  log('connected as', address)

  for (const c of CATS) {
    const t0 = Date.now()
    const row = await rowFor(c.row)
    if ((await row.getAttribute('data-state')) === 'done') { log(c.row, 'already done'); continue }
    log(c.row, 'opening the hire sheet')
    await row.getByRole('link', { name: 'Hire' }).click()
    const sheet = page.locator('.sheet')
    await sheet.waitFor({ timeout: 20000 })
    await sheet.locator('.hs-agent').waitFor({ timeout: 20000 })
    const agent = (await sheet.locator('.hs-name').textContent())?.trim()
    log(c.row, '->', agent)
    if (c.key === 'health_factor') await sheet.getByRole('button', { name: /use a real account/i }).click()
    if (c.key === 'rebalancing') await sheet.getByRole('button', { name: /marque's own live position/i }).click()
    if (c.key === 'grid') { await sheet.getByRole('button', { name: /band ±10%/i }).waitFor({ timeout: 20000 }); await sheet.getByRole('button', { name: /band ±10%/i }).click() }
    log(c.row, 'asking for a price')
    await sheet.getByRole('button', { name: /get a live price/i }).click()
    const hireBtn = sheet.getByRole('button', { name: /^hire .* for |^switch to/i })
    await hireBtn.waitFor({ timeout: 60000 })
    await page.waitForTimeout(1500)
    await shot(`${c.key}-1-price`)
    if (args.dry) { log('dry run: stopping before the first signature'); break }
    await hireBtn.click()
    // Paid and notified: the sheet becomes the head of the Job Room.
    await sheet.locator('.hs-done').waitFor({ timeout: 240000 })
    const jobHref = await sheet.getByRole('link', { name: /open the job room/i }).getAttribute('href')
    log(c.row, 'paid, job', jobHref, `${Math.round((Date.now() - t0) / 1000)} s`)
    await shot(`${c.key}-2-working`)
    await sheet.locator('.hs-done-ico[data-state="done"]').waitFor({ timeout: 300000 })
    const delivered = Math.round((Date.now() - t0) / 1000)
    log(c.row, 'delivered', `${delivered} s`)
    await shot(`${c.key}-3-delivered`)
    // Rate it in the Job Room.
    await sheet.getByRole('link', { name: /open the job room/i }).click()
    await page.waitForURL(/\/jobs\//, { timeout: 30000 })
    await page.locator('.ja-rate').waitFor({ timeout: 60000 })
    await page.getByLabel('5 of 5').check({ force: true })
    await page.getByRole('button', { name: /rate 5 of 5 on chain/i }).click()
    await page.getByText(/rated on chain/i).first().waitFor({ timeout: 180000 })
    log(c.row, 'rated')
    await shot(`${c.key}-4-rated`)
    evidence.hires.push({ category: c.key, agent, job: jobHref, secondsToDelivered: delivered, secondsTotal: Math.round((Date.now() - t0) / 1000) })
    // Back to the quest: the row ticks once the indexer has the events.
    await page.goto(`${BASE}/quest`, { waitUntil: 'networkidle', timeout: 90000 })
    for (let i = 0; i < 18; i++) {
      const st = await (await rowFor(c.row)).getAttribute('data-state')
      if (st === 'done') break
      await page.waitForTimeout(5000)
    }
    log(c.row, 'row state', await (await rowFor(c.row)).getAttribute('data-state'))
  }
  await page.waitForTimeout(3000)
  await shot('5-final')
  evidence.finalStates = await page.locator('.qt-row').evaluateAll((els) => els.map((e) => [e.querySelector('strong')?.textContent, e.getAttribute('data-state')]))
} catch (e) {
  log('FAILED', e.message.split('\n')[0])
  evidence.error = e.message.split('\n')[0]
  await shot('failure')
} finally {
  evidence.finishedAt = new Date().toISOString()
  await ctx.close()
  await browser.close()
  const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'))
  if (webm) {
    const mp4 = join(OUT, `p2-08-quest-${TAG}.mp4`)
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(videoDir, webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', mp4]); evidence.video = mp4 } catch { renameSync(join(videoDir, webm), join(OUT, `p2-08-quest-${TAG}.webm`)) }
  }
  writeFileSync(join(OUT, `p2-08-accept-${TAG}.json`), JSON.stringify(evidence, null, 2))
  log('evidence', join(OUT, `p2-08-accept-${TAG}.json`))
}
