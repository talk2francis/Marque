#!/usr/bin/env node
/**
 * CI smoke (P2-11): the four pages a quest user meets, readable with no wallet.
 *   SMOKE_BASE=https://marque.trade node scripts/ci-smoke.mjs
 * Fails on a non-200, a page error, a console error, or a page missing what it is for.
 */
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE || 'https://marque.trade'
const PAGES = [
  { path: '/', expect: /Hire agents that/i, what: 'home hero' },
  { path: '/register', expect: /Ready to hire/i, what: 'marketplace tabs' },
  { path: '/agents/keel', expect: /What you get/i, what: 'storefront sections' },
  { path: '/quest', expect: /Complete the/i, what: 'quest page' },
]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
let failed = 0
for (const p of PAGES) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`) })
  const res = await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 90_000 }).catch((e) => ({ status: () => 0, e }))
  const status = res.status()
  const text = status === 200 ? await page.locator('body').innerText() : ''
  const ok = status === 200 && p.expect.test(text) && errors.length === 0
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${status} ${p.path}  ${p.what}${errors.length ? `  ${errors.join(' | ')}` : ''}`)
  if (!ok) failed++
  await page.close()
}
await browser.close()
process.exit(failed ? 1 : 0)
