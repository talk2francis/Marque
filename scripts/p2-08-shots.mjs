/**
 * P2-08 state screenshots: /quest, /me, the hire sheet and the Job Room, with no
 * wallet and with a read-only connected wallet (headless-wallet.mjs; every signature
 * is rejected, so nothing is sent).
 *
 *   node scripts/p2-08-shots.mjs <outDir> [--base=http://127.0.0.1:3299] [--wallet=0x...] [--themes=night,day] [--widths=1440,390]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { attachWallet, connectInPage } from './headless-wallet.mjs'

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const OUT = process.argv[2]
const BASE = args.base ?? 'http://127.0.0.1:3299'
const WALLET = args.wallet ?? '0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452'
const THEMES = String(args.themes ?? 'night,day').split(',')
const WIDTHS = String(args.widths ?? '1440,390').split(',').map(Number)
const KEEL = '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556'
const LATTICE = '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341554'
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch()
async function ctxFor(theme, w, withWallet) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, reducedMotion: 'reduce' })
  await ctx.addInitScript((t) => { try { localStorage.setItem('marque-theme', t) } catch { /* no storage */ } }, theme)
  if (withWallet) await attachWallet(ctx, { address: WALLET })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${theme} ${w} ${page.url()}: ${e.message.slice(0, 200)}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WalletConnect|walletconnect/i.test(m.text())) errors.push(`${theme} ${w} ${page.url()}: ${m.text().slice(0, 200)}`) })
  return { ctx, page }
}
const shot = async (page, name, full = true) => { await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full }); console.log('ok', name) }
const go = async (page, path, wait = 1500) => { await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {}); await page.waitForTimeout(wait) }

for (const theme of THEMES) {
  for (const w of WIDTHS) {
    const tag = `${w}.${theme}`
    // No wallet
    {
      const { ctx, page } = await ctxFor(theme, w, false)
      await go(page, '/quest', 2500); await shot(page, `quest-nowallet.${tag}`)
      await go(page, '/me'); await shot(page, `me-nowallet.${tag}`)
      for (const [id, label] of [['56/56810', 'submitted'], ['56/56811', 'cancelled'], ['97/1343', 'testnet-settled']]) { await go(page, `/jobs/${id}`, 2500); await shot(page, `job-${label}.${tag}`) }
      // Hire sheet: task form, then a live price
      await go(page, `/register?hire=${encodeURIComponent(LATTICE)}`, 2500); await shot(page, `hire-form-grid.${tag}`, false)
      await go(page, `/register?hire=${encodeURIComponent(KEEL)}`, 2500)
      await page.getByRole('button', { name: /use a real account/i }).click().catch(() => {})
      await page.waitForTimeout(300); await shot(page, `hire-form-hf.${tag}`, false)
      await page.getByRole('button', { name: /get a live price/i }).click().catch(() => {})
      await page.waitForTimeout(6000); await shot(page, `hire-price-nowallet.${tag}`, false)
      await ctx.close()
    }
    // Read-only connected wallet
    {
      const { ctx, page } = await ctxFor(theme, w, true)
      await go(page, '/quest', 1500)
      await connectInPage(page).catch((e) => errors.push(`connect failed: ${e.message.slice(0, 120)}`))
      await page.waitForTimeout(3500); await shot(page, `quest-connected.${tag}`)
      await go(page, '/me', 4000); await shot(page, `me-connected.${tag}`)
      await go(page, '/jobs/56/56810', 3000); await shot(page, `job-submitted-client.${tag}`)
      await go(page, `/quest?hire=${encodeURIComponent(KEEL)}`, 2500)
      await page.getByRole('button', { name: /get a live price/i }).click().catch(() => {})
      await page.waitForTimeout(7000); await shot(page, `hire-price-connected.${tag}`, false)
      await page.getByRole('button', { name: /^hire keel for|^switch to/i }).click().catch(() => {})
      await page.waitForTimeout(5000); await shot(page, `hire-rejected.${tag}`, false)
      if (w >= 1024) {
        await page.keyboard.press('Escape').catch(() => {})
        await go(page, '/quest', 1500)
        await page.getByRole('button', { name: /open account menu/i }).click().catch(() => {})
        await page.waitForTimeout(800); await shot(page, `account-menu.${tag}`, false)
      }
      await ctx.close()
    }
  }
}
await browser.close()
if (errors.length) { console.log(`\nerrors (${errors.length}):`); for (const e of [...new Set(errors)].slice(0, 40)) console.log('  ' + e) }
