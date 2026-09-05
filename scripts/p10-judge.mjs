/**
 * P10 acceptance: /judge, start to finish, on a fresh browser profile.
 *
 * The bar is under 100 seconds with no extensions. Everything it clicks is
 * real: two transactions on BNB Smart Chain testnet and a live agent call, so
 * a slow chain makes this slow and that is the honest result rather than
 * something to retry until it looks good.
 *
 *   BASE_URL=https://marque.trade node scripts/p10-judge.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'playwright-report', 'p10-judge')
const BASE = process.env.BASE_URL ?? 'https://marque.trade'

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const log = []
const note = (s, d) => {
  const line = `${new Date().toISOString()}  ${s}${d ? ` — ${d}` : ''}`
  log.push(line); console.log(line)
}

// A genuinely fresh profile: no storage state, no extensions, default settings.
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
})
const page = await context.newPage()
const shot = (n) => page.screenshot({ path: join(OUT, `${n}.png`), fullPage: false })

const STEPS = [
  ['Read the position', /read the position/i],
  ['Rank the agents', /rank the agents/i],
  ['Grant a charter', /grant a charter/i],
  ['Run it', /^run it$/i],
  ['Get the receipt', /get the receipt/i],
  ['Revoke now', /revoke now/i],
]

let started = 0
try {
  await page.goto(`${BASE}/judge`, { waitUntil: 'networkidle' })
  await shot('00-landing')
  note('loaded', await page.locator('h1').first().innerText())

  started = Date.now()
  for (const [i, [label, rx]] of STEPS.entries()) {
    const t0 = Date.now()
    await page.getByRole('button', { name: rx }).click()
    // Each step is finished when its button is gone and the next one appears,
    // or when the closing drawer renders on the last step.
    if (i < STEPS.length - 1) {
      await page.getByRole('button', { name: STEPS[i + 1][1] }).waitFor({ state: 'visible', timeout: 180_000 })
    } else {
      await page.getByText('What you just saw, against the rubric').waitFor({ timeout: 180_000 })
    }
    note(`step ${i + 1} ${label}`, `${((Date.now() - t0) / 1000).toFixed(1)}s`)
    await shot(`0${i + 1}-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`)
  }

  const total = (Date.now() - started) / 1000
  await shot('07-drawer')
  const body = await page.locator('body').innerText()
  const txLinks = await page.locator('a[href*="testnet.bscscan.com/tx/"]').count()
  note('TOTAL', `${total.toFixed(1)}s · ${txLinks} BscScan transaction link(s) on the page`)
  note('verdict', total < 100 ? `PASS — under the 100s bar` : `FAIL — over the 100s bar`)
  if (/Could not|did not land|was refused/i.test(body)) note('warning', 'an error string is present on the page')
} catch (err) {
  note('FAILED', err.message.slice(0, 200))
  await shot('99-failure')
  process.exitCode = 1
} finally {
  writeFileSync(join(OUT, 'judge.log'), log.join('\n') + '\n')
  await context.close()
  await browser.close()
  console.log(`\nartifacts in ${OUT}`)
}
