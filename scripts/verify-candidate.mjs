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
import { warmCandidateProjections } from './lib/warm-projections.mjs'
import { verifyPreviousAssets } from './lib/previous-assets.mjs'
import { isVerificationRpcRead } from './lib/verification-rpc.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3299'
// Deployment metadata from the slot, checked before Chromium or a traffic switch.
const expectedRelease = process.env.EXPECTED_RELEASE_SHA
if (expectedRelease) {
  if (!/^[a-f0-9]{40}$/.test(expectedRelease)) throw new Error('invalid expected release SHA')
  const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
  const body = await health.json()
  if (!health.ok || body.ok !== true || body.release !== expectedRelease) throw new Error('candidate release metadata mismatch')
  console.log(`ok   candidate release metadata ${expectedRelease}`)
}
if (process.env.PREVIOUS_BASE_URL) {
  const count = await verifyPreviousAssets(BASE, process.env.PREVIOUS_BASE_URL)
  console.log(`ok   ${count} previous-release static assets remain available`)
}
const projections = await warmCandidateProjections(BASE)
console.log('ok   runtime projections refreshed before browser acceptance: ' + JSON.stringify(projections))
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
const blockedWrites = []
let telemetryIntercepted = 0
let rpcReads = 0
async function newReadOnlyPage(options) {
  const page = await browser.newPage(options)
  await page.route('**/*', (route) => {
    const request = route.request()
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue()
    if (new URL(request.url()).pathname === '/api/v1/events') {
      telemetryIntercepted++
      return route.fulfill({ status: 204, body: '' })
    }
    if (request.method() === 'POST' && isVerificationRpcRead(request.url(), request.postData())) {
      rpcReads++
      return route.continue()
    }
    blockedWrites.push({ method: request.method(), origin: new URL(request.url()).origin })
    return route.abort()
  })
  return page
}
let failures = 0

for (const route of ROUTES) {
  for (const width of [1440, 1024, 390]) {
    const page = await newReadOnlyPage({ viewport: { width, height: 900 } })
    const problems = []
    page.on('console', (m) => {
      const t = m.text()
      if (m.type() === 'error' && !/favicon|net::ERR_|Failed to load resource/.test(t)) problems.push(`console: ${t.slice(0, 160)}`)
      if (/Content Security Policy|Refused to (evaluate|execute)/i.test(t)) problems.push(`CSP: ${t.slice(0, 200)}`)
    })
    page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`))
    let status = 0
    // One retry after a load timeout only (2 Nov): right after a build the host is busy and a heavy page can miss
    // network idle once. The retry must still load fully and pass every check below; any other error fails at once.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 })
        status = res?.status() ?? 0
        break
      } catch (e) {
        if (attempt === 0 && /Timeout/.test(String(e))) { console.log(`     ${route} @${width}: load timed out once, retrying`); continue }
        problems.push(`goto: ${String(e).slice(0, 120)}`)
        break
      }
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
const page = await newReadOnlyPage({ viewport: { width: 1440, height: 900 } })
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
  const page = await newReadOnlyPage({ viewport: { width: 1280, height: 900 } })
  const walletPath = '/api/v1/phase2/wallet/' + HIRER_ADDR.toLowerCase()
  // V4 reads the wallet once per lane (mainnet and practice); the history counts the mainnet reply.
  const walletReply = page.waitForResponse(
    (response) => { const u = new URL(response.url()); return u.pathname.toLowerCase() === walletPath && u.searchParams.get('chainId') !== '97' },
    { timeout: 30000 },
  ).then(async (response) => ({
    status: response.status(),
    hires: (await response.json().catch(() => null))?.hires?.length ?? 0,
  })).catch(() => ({ status: 0, hires: 0 }))
  await page.goto(`${BASE}/me?addr=${HIRER_ADDR}`, { waitUntil: 'networkidle' })
  const wallet = await walletReply
  // Post-close My Marque: Today is the default; the history lives under Jobs.
  // Check the actual tabs and populated history, without accepting a document reload.
  const documentKey = await page.evaluate(() => { window.__verificationDocument = window.crypto.randomUUID(); return window.__verificationDocument })
  const initialText = await page.evaluate(() => document.body.innerText)
  const hasSummary = ['Set and Earn', 'In escrow now', 'Paid to agents', 'Spending controls'].every(h => new RegExp(h, 'i').test(initialText))
  const tabNames = await page.getByRole('tab').allTextContents()
  const hasSections = hasSummary && ['Today', 'Positions', 'Jobs', 'Money'].every(name => tabNames.some(text => text.trim() === name))
    && await page.getByRole('heading', { name: /^Today/ }).count() > 0
  await page.getByRole('tab', { name: 'Jobs', exact: true }).click()
  await page.locator('a[href^="/jobs/"]').first().waitFor({ timeout: 15000 }).catch(() => {})
  const text = await page.evaluate(() => document.body.innerText)
  const hasJobs = /job \d{3,}/i.test(text) && await page.getByRole('button', { name: 'History', exact: true }).count() === 1
  const sameDocument = await page.evaluate(() => window.__verificationDocument) === documentKey
  const historyOk = wallet.status === 200 && wallet.hires > 0 && hasSections && hasJobs && sameDocument
  console.log(historyOk
    ? 'ok   /me?addr= renders Today and the four hiring tabs, then opens populated Jobs without reloading'
    : `FAIL /me?addr= incomplete (wallet=${wallet.status} hires=${wallet.hires} sections=${hasSections} jobs=${hasJobs} sameDocument=${sameDocument})`)
  if (!historyOk) {
    failures++
  }
  await page.close()
}

// The wallet path: its bundle loads on click, so a page load alone proves
// nothing about whether the tightened script-src breaks connecting.
{
  const page = await newReadOnlyPage({ viewport: { width: 1440, height: 900 } })
  const violations = []
  page.on('console', (m) => {
    const t = m.text()
    if (/Content Security Policy|Refused to (evaluate|execute|load)|unsafe-eval/i.test(t)) violations.push(t.slice(0, 220))
  })
  page.on('pageerror', (e) => {
    const t = String(e)
    if (/CSP|unsafe-eval|EvalError|call to eval/i.test(t)) violations.push(`pageerror: ${t.slice(0, 220)}`)
  })
  await page.goto(BASE + '/app/charter', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const connect = page.locator('button').filter({ hasText: /connect/i }).first()
  await connect.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  if (await connect.count()) {
    await connect.click({ timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(8000)
    const dialog = await page.locator('[role="dialog"]').count()
    console.log(dialog ? `\nok   wallet modal opens (${dialog} dialog elements), no CSP refusal` : '\nFAIL wallet modal did not open')
    if (!dialog) failures++
  } else {
    console.log('\nFAIL no connect button on /app/charter')
    failures++
  }
  for (const v of [...new Set(violations)]) { console.log('      CSP: ' + v); failures++ }
  await page.close()
}

// Readable without scripts (T7, 2 Nov): the home page's plain HTML carries the hireable and priced counts, its
// JSON-LD carries the same numbers, and the marketplace's plain HTML carries a count and agent cards. A reader that
// runs no JavaScript (most AI assistants) sees what a person sees.
{
  let problem = null
  for (let attempt = 0; attempt < 3; attempt++) {
    problem = null
    const html = await fetch(`${BASE}/`).then((r) => r.text()).catch(() => '')
    const ld = html.match(/<script type="application\/ld\+json" id="supply-ld">(.*?)<\/script>/s)
    const values = ld ? Object.fromEntries(JSON.parse(ld[1]).variableMeasured.map((v) => [v.name, v.value])) : null
    const hero = html.replace(/<[^>]+>/g, ' ').match(/Hireable\s+(\d+)\s+hireable now on mainnet/)
    if (!values) problem = 'home has no supply JSON-LD'
    else if (!hero) problem = 'home HTML has no hireable count'
    else if (Number(hero[1]) !== values.hireable) problem = `home hero says ${hero[1]} hireable, JSON-LD says ${values.hireable}`
    const reg = await fetch(`${BASE}/register`).then((r) => r.text()).catch(() => '')
    if (!problem && /Counting agents/.test(reg.replace(/<script[\s\S]*?<\/script>/g, ''))) problem = '/register HTML says Counting agents'
    if (!problem && !/data-agent="\d+:/.test(reg)) problem = '/register HTML has no agent card'
    if (!problem) break
  }
  if (problem) { failures++; console.log(`FAIL no-script read: ${problem}`) } else console.log('ok   no-script read: home counts, JSON-LD and marketplace cards are in the HTML')
}

await browser.close()
failures += blockedWrites.length
console.log(`Read-only verification: ${telemetryIntercepted} telemetry attempts intercepted locally; ${blockedWrites.length} unexpected writes blocked.`)
console.log(`Read-only BSC contract RPC requests allowed: ${rpcReads}`)
if (blockedWrites.length) console.log(JSON.stringify(blockedWrites))
console.log(`\n${failures} route/width combinations with problems`)
process.exit(failures ? 1 : 0)
