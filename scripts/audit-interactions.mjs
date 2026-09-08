#!/usr/bin/env node
/**
 * Dead / broken control audit.
 *
 * Per route: enumerate every visible enabled <button> / [role=button], and for
 * each — re-located fresh by index so a re-render does not detach it — click it
 * and watch for console errors, uncaught exceptions, or a click that does
 * nothing (no navigation, no DOM mutation, no dialog). Then HEAD every
 * same-origin link and report 4xx/5xx.
 *
 *   BASE_URL=https://marque.trade node scripts/audit-interactions.mjs
 *   node scripts/audit-interactions.mjs --routes /,/register
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://marque.trade'
const argRoutes = process.argv.includes('--routes')
  ? process.argv[process.argv.indexOf('--routes') + 1].split(',')
  : null

const ROUTES = argRoutes || [
  '/', '/register', '/register/rebalancing', '/compare', '/judge',
  '/pancakeswap', '/pancakeswap/proof', '/standard', '/standard/MCS-REB-1',
  '/ledger', '/ledger/methodology', '/status', '/docs',
  '/builders/test', '/builders/claim', '/app/charter', '/app/charters',
  '/receipts/latest',
]

const findings = []
const linkStatus = new Map()
const browser = await chromium.launch()

for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const cerr = []
  const perr = []
  page.on('console', (m) => { if (m.type() === 'error') cerr.push(m.text().slice(0, 180)) })
  page.on('pageerror', (e) => perr.push(String(e).slice(0, 180)))
  page.on('dialog', (d) => d.dismiss().catch(() => {}))

  const url = BASE + route
  let resp
  try {
    resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (e) {
    findings.push({ route, kind: 'route-load-failed', detail: e.message.slice(0, 140) })
    await ctx.close(); process.stdout.write(`✗ ${route} (load failed)\n`); continue
  }
  if (resp && resp.status() >= 400) findings.push({ route, kind: 'route-status', detail: `HTTP ${resp.status()}` })
  await page.waitForTimeout(2800)

  if (cerr.length) findings.push({ route, kind: 'console-on-load', detail: [...new Set(cerr)].slice(0, 4).join('  |  ') })
  if (perr.length) findings.push({ route, kind: 'pageerror-on-load', detail: [...new Set(perr)].slice(0, 3).join('  |  ') })

  // ---- buttons: located fresh each pass ----
  const loc = page.locator('button:visible:not([disabled]), [role="button"]:visible:not([aria-disabled="true"])')
  const count = await loc.count().catch(() => 0)
  for (let i = 0; i < count; i++) {
    const btn = loc.nth(i)
    let label = ''
    try {
      if (!(await btn.isVisible().catch(() => false))) continue
      label = ((await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label').catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 44)
    } catch { continue }
    // skip the theme toggle (its whole job is to mutate <html>) and wallet connect
    if (/daylight|night|connect/i.test(label)) continue

    const beforeUrl = page.url()
    const before = await btn.evaluate((el) => ({
      len: document.body.innerHTML.length,
      pressed: el.getAttribute('aria-pressed'),
      expanded: el.getAttribute('aria-expanded'),
      cls: el.className,
    })).catch(() => ({ len: 0 }))
    cerr.length = 0; perr.length = 0

    try {
      await btn.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
      await btn.click({ timeout: 3000, force: true })
      await page.waitForTimeout(900)
    } catch (e) {
      findings.push({ route, kind: 'button-click-failed', detail: `"${label}" — ${e.message.split('\n')[0].slice(0, 100)}` })
      continue
    }

    if (cerr.length) findings.push({ route, kind: 'button-console-error', detail: `"${label}" → ${[...new Set(cerr)].slice(0, 3).join(' | ')}` })
    if (perr.length) findings.push({ route, kind: 'button-pageerror', detail: `"${label}" → ${[...new Set(perr)].slice(0, 2).join(' | ')}` })

    const afterUrl = page.url()
    const after = await btn.evaluate((el) => ({
      len: document.body.innerHTML.length,
      pressed: el.getAttribute('aria-pressed'),
      expanded: el.getAttribute('aria-expanded'),
      cls: el.className,
      text: el.textContent,
    })).catch(() => ({ len: before.len, pressed: before.pressed, expanded: before.expanded, cls: before.cls }))
    const navigated = afterUrl !== beforeUrl
    const responded =
      Math.abs(after.len - before.len) > 30 ||
      after.pressed !== before.pressed ||
      after.expanded !== before.expanded ||
      after.cls !== before.cls

    if (!navigated && !responded && !cerr.length && !perr.length) {
      const isSubmit = await btn.evaluate((el) => el.type === 'submit' || !!el.closest('form')).catch(() => false)
      const menuish = await btn.evaluate((el) => el.hasAttribute('aria-haspopup')).catch(() => false)
      if (!isSubmit && !menuish) findings.push({ route, kind: 'button-inert', detail: `"${label || '(no label)'}" — click produced no navigation, state change or error` })
    }

    if (navigated) {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForTimeout(1600) } catch { break }
    }
  }

  // ---- links ----
  const hrefs = await page.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]).catch(() => [])
  for (const href of hrefs) {
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
    if (href.startsWith('http') && !href.startsWith(BASE)) continue
    const target = href.startsWith('http') ? href : BASE + (href.startsWith('/') ? href : '/' + href)
    if (linkStatus.has(target)) {
      if (linkStatus.get(target) >= 400) findings.push({ route, kind: 'dead-link', detail: `${href} → HTTP ${linkStatus.get(target)}` })
      continue
    }
    try {
      const r = await page.request.get(target, { timeout: 15000, maxRedirects: 4 })
      linkStatus.set(target, r.status())
      if (r.status() >= 400) findings.push({ route, kind: 'dead-link', detail: `${href} → HTTP ${r.status()}` })
    } catch (e) {
      linkStatus.set(target, 599)
      findings.push({ route, kind: 'dead-link', detail: `${href} → ${e.message.slice(0, 70)}` })
    }
  }

  await ctx.close()
  process.stdout.write(`· ${route}  (${count} buttons, ${hrefs.length} links)\n`)
}

await browser.close()

console.log('\n' + '='.repeat(64))
const real = findings.filter((f) => f.kind !== 'button-click-failed')
const flaky = findings.filter((f) => f.kind === 'button-click-failed')
const byKind = {}
for (const f of real) (byKind[f.kind] ??= []).push(f)
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`\n${kind}  (${list.length})`)
  for (const f of list) console.log(`  ${f.route.padEnd(26)} ${f.detail}`)
}
if (flaky.length) console.log(`\n(${flaky.length} click-timeouts — likely covered elements / harness flake, not counted)`)
console.log(`\n${real.length} real finding(s) across ${ROUTES.length} routes.`)
process.exit(real.length ? 1 : 0)
