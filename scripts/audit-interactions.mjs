#!/usr/bin/env node
/**
 * Dead / broken control audit.
 *
 * For every route: click every visible, enabled <button> and [role=button] and
 * watch for console errors, uncaught exceptions, and clicks that do literally
 * nothing (no DOM mutation, no navigation, no dialog, no network). Then follow
 * every same-origin <a href> and report any that 404 / 500.
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
const linkCache = new Map()

const browser = await chromium.launch()

for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))

  const url = BASE + route
  let resp
  try {
    resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (e) {
    findings.push({ route, kind: 'route-load-failed', detail: e.message.slice(0, 160) })
    await ctx.close()
    continue
  }
  if (resp && resp.status() >= 400) {
    findings.push({ route, kind: 'route-status', detail: `HTTP ${resp.status()}` })
  }
  await page.waitForTimeout(2500)

  const loadConsole = consoleErrors.splice(0)
  const loadPage = pageErrors.splice(0)
  if (loadConsole.length) findings.push({ route, kind: 'console-on-load', detail: loadConsole.slice(0, 4).join(' | ') })
  if (loadPage.length) findings.push({ route, kind: 'pageerror-on-load', detail: loadPage.slice(0, 3).join(' | ') })

  // ---- buttons ----
  const buttons = await page.$$('button:not([disabled]), [role="button"]:not([aria-disabled="true"])')
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i]
    let label = ''
    try {
      if (!(await btn.isVisible())) continue
      label = ((await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label')) || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    } catch { continue }

    const before = {
      url: page.url(),
      html: await page.evaluate(() => document.body.innerHTML.length).catch(() => 0),
    }
    consoleErrors.length = 0
    pageErrors.length = 0
    let dialog = false
    const onDialog = (d) => { dialog = true; d.dismiss().catch(() => {}) }
    page.on('dialog', onDialog)

    try {
      await btn.click({ timeout: 2500, trial: false })
      await page.waitForTimeout(450)
    } catch (e) {
      findings.push({ route, kind: 'button-click-threw', detail: `"${label}" — ${e.message.slice(0, 120)}` })
      page.off('dialog', onDialog)
      continue
    }
    page.off('dialog', onDialog)

    if (consoleErrors.length) findings.push({ route, kind: 'button-console-error', detail: `"${label}" → ${consoleErrors.slice(0, 3).join(' | ')}` })
    if (pageErrors.length) findings.push({ route, kind: 'button-pageerror', detail: `"${label}" → ${pageErrors.slice(0, 2).join(' | ')}` })

    const after = {
      url: page.url(),
      html: await page.evaluate(() => document.body.innerHTML.length).catch(() => 0),
    }
    const navigated = after.url !== before.url
    const mutated = Math.abs(after.html - before.html) > 24
    if (!navigated && !mutated && !dialog && !consoleErrors.length && !pageErrors.length) {
      // Genuinely inert. Skip known-benign (submit buttons in forms rely on inputs).
      const isSubmit = await btn.evaluate((el) => el.type === 'submit' || el.closest('form') !== null).catch(() => false)
      if (!isSubmit) findings.push({ route, kind: 'button-inert', detail: `"${label || '(no label)'}" — click did nothing` })
    }

    // If we navigated away, go back so the remaining buttons are still testable.
    if (navigated) {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForTimeout(1500) } catch { break }
    }
  }

  // ---- links ----
  const hrefs = await page.$$eval('a[href]', (as) => Array.from(new Set(as.map((a) => a.getAttribute('href')))))
  for (const href of hrefs) {
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('http') && !href.startsWith(BASE)) continue
    const target = href.startsWith('http') ? href : BASE + (href.startsWith('/') ? href : '/' + href)
    if (linkCache.has(target)) {
      if (linkCache.get(target) >= 400) findings.push({ route, kind: 'dead-link', detail: `${href} → HTTP ${linkCache.get(target)}` })
      continue
    }
    try {
      const r = await page.request.get(target, { timeout: 15000, maxRedirects: 3 })
      linkCache.set(target, r.status())
      if (r.status() >= 400) findings.push({ route, kind: 'dead-link', detail: `${href} → HTTP ${r.status()}` })
    } catch (e) {
      linkCache.set(target, 599)
      findings.push({ route, kind: 'dead-link', detail: `${href} → ${e.message.slice(0, 80)}` })
    }
  }

  await ctx.close()
  process.stdout.write(`· ${route}\n`)
}

await browser.close()

console.log('\n' + '='.repeat(60))
if (!findings.length) {
  console.log('No dead or broken controls found.')
} else {
  const byKind = {}
  for (const f of findings) (byKind[f.kind] ??= []).push(f)
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`\n${kind}  (${list.length})`)
    for (const f of list) console.log(`  ${f.route.padEnd(26)} ${f.detail}`)
  }
}
console.log(`\n${findings.length} finding(s) across ${ROUTES.length} routes.`)
process.exit(findings.length ? 1 : 0)
