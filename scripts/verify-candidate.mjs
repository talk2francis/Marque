/**
 * Verify a candidate build before it becomes production.
 *
 * `scripts/build-web.sh` with MARQUE_BUILD_DIR builds into its own directory so
 * the running server's assets are never removed underneath it. This exercises
 * that candidate on an alternate port and checks the things a successful
 * compile does not prove:
 *
 *   - every route answers 200 at three widths, with no console or page errors
 *   - no CSP violation, including in the wallet path, whose bundle only loads
 *     on click — the reason 'unsafe-eval' could be dropped with confidence
 *   - the document cannot actually be scrolled sideways (scrollWidth alone is
 *     not the test: an overflow:clip subtree reports width it cannot scroll)
 *
 * Usage: node scripts/verify-candidate.mjs http://127.0.0.1:3299
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3299'
// An address with real first-party history — charters, hires, receipts, seals —
// so the profile renders populated sections rather than only empty states.
const ACTIVE_ADDR = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
// The P2-05 mainnet smoke wallet: five real hires, delivered and rated.
const HIRER_ADDR = '0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452'
const DEAD_ADDR = '0x000000000000000000000000000000000000dEaD'
const ROUTES = [
  '/', '/judge', '/ledger', '/ledger/methodology', '/register', '/docs', '/standard',
  '/pancakeswap', '/positions',
  '/me', `/me?addr=${ACTIVE_ADDR}`, `/me?addr=${DEAD_ADDR}`,
]
const browser = await chromium.launch()
let failures = 0

for (const route of ROUTES) {
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const problems = []
    page.on('console', (m) => {
      const t = m.text()
      if (m.type() === 'error' && !/favicon|net::ERR_|Failed to load resource/.test(t)) problems.push(`console: ${t.slice(0, 160)}`)
      if (/Content Security Policy|Refused to (evaluate|execute)/i.test(t)) problems.push(`CSP: ${t.slice(0, 200)}`)
    })
    page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`))
    let status = 0
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 })
      status = res?.status() ?? 0
    } catch (e) {
      problems.push(`goto: ${String(e).slice(0, 120)}`)
    }
    if (status >= 400) problems.push(`http ${status}`)

    const scrolls = await page.evaluate(async () => {
      window.scrollTo(9999, 0)
      await new Promise((r) => setTimeout(r, 120))
      const x = window.scrollX
      window.scrollTo(0, 0)
      return x
    }).catch(() => 0)
    if (scrolls > 1) problems.push(`scrolls horizontally by ${scrolls}px`)

    if (problems.length) {
      failures++
      console.log(`FAIL ${route} @${width}`)
      for (const p of [...new Set(problems)]) console.log(`      ${p}`)
    } else {
      console.log(`ok   ${route} @${width}  (${status})`)
    }
    await page.close()
  }
}

// The Ledger must no longer say a grade is pending for runs that answered a
// different task — that was the misleading "grading…" a judge would read.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE + '/ledger', { waitUntil: 'networkidle' })
const body = await page.evaluate(() => document.body.innerText)
console.log('\n--- Ledger completion language ---')
for (const line of body.split('\n')) {
  if (/missing|outstanding|grading|matching task|verifiable chain block|repetition/i.test(line)) console.log('  ' + line.trim())
}

// The profile is a projection over first-party tables. Exercise the API end to
// end for a populated address, a wallet-free empty address, and a bad one, and
// check the page actually renders the populated sections.
{
  const good = await fetch(`${BASE}/api/v1/profile/${ACTIVE_ADDR}`).then((r) => r.json()).catch((e) => ({ error: String(e) }))
  const shapeOk = good && good.charters && good.hires && good.receipts && good.seals && Array.isArray(good.activity)
  const populated = shapeOk && (good.hires.all.length > 0 || good.charters.all.length > 0 || good.seals.all.length > 0)
  console.log(shapeOk
    ? `\nok   /api/v1/profile — shape valid, ${good.hires.all.length} hires / ${good.charters.all.length} charters / ${good.seals.all.length} seals / ${good.activity.length} activity`
    : `\nFAIL /api/v1/profile shape: ${JSON.stringify(good).slice(0, 200)}`)
  if (!shapeOk || !populated) failures++

  const bad = await fetch(`${BASE}/api/v1/profile/not-an-address`).then((r) => r.status).catch(() => 0)
  console.log(bad === 400 ? 'ok   /api/v1/profile rejects a bad address (400)' : `FAIL bad address returned ${bad}`)
  if (bad !== 400) failures++

  // My Marque (P2-08, DESIGN-SYSTEM 8.7) for a wallet with real mainnet hires: every section
  // renders and the job history is populated from the Quest API.
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${BASE}/me?addr=${HIRER_ADDR}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  const text = await page.evaluate(() => document.body.innerText)
  const hasSections = ['Set and Earn', 'Active jobs', 'History', 'Spending controls', 'Ratings you gave', 'Your agents'].every((h) => new RegExp(h, 'i').test(text))
  const hasJobs = /job \d{3,}/i.test(text)
  console.log(hasSections && hasJobs
    ? 'ok   /me?addr= renders every My Marque section with a populated job history'
    : `FAIL /me?addr= incomplete (sections=${hasSections} jobs=${hasJobs})`)
  if (!(hasSections && hasJobs)) failures++
  await page.close()
}

// The wallet path: its bundle loads on click, so a page load alone proves
// nothing about whether the tightened script-src breaks connecting.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const violations = []
  page.on('console', (m) => {
    const t = m.text()
    if (/Content Security Policy|Refused to (evaluate|execute|load)|unsafe-eval/i.test(t)) violations.push(t.slice(0, 220))
  })
  page.on('pageerror', (e) => {
    const t = String(e)
    if (/CSP|unsafe-eval|EvalError|call to eval/i.test(t)) violations.push(`pageerror: ${t.slice(0, 220)}`)
  })
  await page.goto(BASE + '/app/charter', { waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)
  const connect = page.locator('button').filter({ hasText: /connect/i }).first()
  if (await connect.count()) {
    await connect.click({ timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(8000)
    const dialog = await page.locator('[data-rk], [role="dialog"]').count()
    console.log(dialog ? `\nok   wallet modal opens (${dialog} dialog elements), no CSP refusal` : '\nFAIL wallet modal did not open')
    if (!dialog) failures++
  } else {
    console.log('\nFAIL no connect button on /app/charter')
    failures++
  }
  for (const v of [...new Set(violations)]) { console.log('      CSP: ' + v); failures++ }
  await page.close()
}

await browser.close()
console.log(`\n${failures} route/width combinations with problems`)
process.exit(failures ? 1 : 0)
