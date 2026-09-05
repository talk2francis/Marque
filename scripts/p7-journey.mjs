/**
 * P7 acceptance: the whole journey, driven through the real UI.
 *
 *   grant → execute → receipt → revoke
 *
 * Recorded as video and captured as stills at each beat, because the Seal is a
 * motion specification and a still cannot show whether it ran. Everything it
 * touches is real: the grant and the revoke are transactions on BNB Smart Chain
 * testnet, and the run calls a live agent endpoint.
 *
 *   BASE_URL=http://127.0.0.1:3400 node scripts/p7-journey.mjs
 *   REDUCED=1 node scripts/p7-journey.mjs     the prefers-reduced-motion pass
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REDUCED = process.env.REDUCED === '1'
const OUT = join(HERE, '..', 'playwright-report', REDUCED ? 'p7-journey-reduced' : 'p7-journey')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3400'

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const log = []
function note(step, detail) {
  const line = `${new Date().toISOString()}  ${step}${detail ? ` — ${detail}` : ''}`
  log.push(line)
  console.log(line)
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  reducedMotion: REDUCED ? 'reduce' : 'no-preference',
})
const page = await context.newPage()
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false })

try {
  // ---- 1. The Charter Desk ------------------------------------------------
  await page.goto(`${BASE}/app/charter?category=health_factor`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await shot('01-desk')
  note('desk', await page.locator('h1').first().innerText())

  // ---- 2. The Seal --------------------------------------------------------
  await page.getByRole('button', { name: /grant a charter/i }).click()
  await page.waitForTimeout(REDUCED ? 60 : 180)
  await shot('02-seal-dim')
  await page.waitForTimeout(REDUCED ? 60 : 260)
  await shot('03-seal-composing')
  await page.waitForSelector('text=Writing to the chain', { timeout: 60_000 })
  await shot('04-seal-pressed')
  // Wait on the transaction link, which only exists once the grant confirmed,
  // then on the mark settling to "Granted".
  await page.waitForSelector('a[href*="testnet.bscscan.com/tx/"]', { timeout: 120_000 })
  await page.waitForFunction(
    () => document.body.innerText.includes('Granted'),
    null,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(600)
  await shot('05-seal-sealed')
  const txHref = await page.locator('a[href*="testnet.bscscan.com/tx/"]').first().getAttribute('href')
  note('granted', txHref)
  // The charter this journey granted, so every later step targets THAT one and
  // not whichever card happens to be first on a page that keeps its history.
  const workHref = await page.locator('a[href*="/app/charters#"]').first().getAttribute('href')
  const charterId = decodeURIComponent(workHref.split('#')[1])
  note('charter', charterId)

  // ---- 3. The strip, on a page that knows nothing about charters ----------
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[role="status"]', { timeout: 20_000 })
  await page.waitForTimeout(600)
  await shot('06-strip-on-register')
  note('strip', await page.locator('[role="status"]').first().innerText())

  // ---- 4. Put it to work --------------------------------------------------
  await page.goto(`${BASE}/app/charters`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await shot('07-charters')
  const card = page.locator(`[id="${charterId}"]`)
  await card.getByRole('button', { name: /put it to work/i }).click()
  await page.waitForURL(/\/runs\//, { timeout: 30_000 })
  await page.waitForTimeout(900)
  await shot('08-run-room-running')
  note('run', page.url())

  // ---- 5. The Run Room, finished -----------------------------------------
  await page.waitForSelector('text=/Complete|Failed/', { timeout: 90_000 })
  await page.waitForTimeout(1200)
  await shot('09-run-room-activity')
  for (const tab of ['Result', 'Transactions', 'Authority', 'Evidence']) {
    await page.getByRole('button', { name: tab, exact: false }).click()
    await page.waitForTimeout(350)
    await shot(`10-run-${tab.toLowerCase()}`)
  }

  // ---- 6. The receipt -----------------------------------------------------
  const receiptLink = page.locator('a[href^="/receipts/"]').first()
  if (await receiptLink.count()) {
    const href = await receiptLink.getAttribute('href')
    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    await shot('11-receipt')
    note('receipt', href)
    const og = await page.request.get(`${BASE}${href}/opengraph-image`)
    note('og-image', `${og.status()} ${og.headers()['content-type']} ${(await og.body()).length} bytes`)
    writeFileSync(join(OUT, '12-opengraph-image.png'), await og.body())
  } else {
    note('receipt', 'the run produced none — nothing is fabricated in its place')
  }

  // ---- 7. Revoke ----------------------------------------------------------
  await page.goto(`${BASE}/app/charters`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const target = page.locator(`[id="${charterId}"]`)
  await target.getByRole('button', { name: /revoke now/i }).click()
  // Wait on THIS card's status attribute, not on the word "Revoked" appearing
  // anywhere — the page keeps every charter it has ever granted, so the word is
  // already on screen and waiting for it would pass before the revoke landed.
  await page.waitForSelector(`[id="${charterId}"][data-status="revoked"]`, { timeout: 120_000 })
  await page.waitForTimeout(900)
  await shot('13-revoked')
  note('revoked', await target.locator('a[href*="testnet.bscscan.com/tx/"]').last().getAttribute('href'))

  // ---- 8. The strip is gone -----------------------------------------------
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  // The strip reflects EVERY live charter, not just this journey's. An earlier
  // run of this script can legitimately leave one standing, so the check asks
  // the API what is actually live rather than assuming the strip should vanish.
  const stillLive = await (await page.request.get(`${BASE}/api/v1/charters/active`)).json()
  const stripShown = (await page.locator('[role="status"]').count()) > 0
  const consistent = stripShown === stillLive.charters.length > 0
  note('strip-after-revoke',
    `${stillLive.charters.length} charter(s) still live · strip ${stripShown ? 'present' : 'absent'} · ${consistent ? 'consistent' : 'INCONSISTENT — bug'}`)
  await shot('14-strip-gone')
} finally {
  writeFileSync(join(OUT, 'journey.log'), log.join('\n') + '\n')
  await context.close()
  await browser.close()
  console.log(`\nartifacts in ${OUT}`)
}
