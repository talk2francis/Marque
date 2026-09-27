/**
 * P2-10 acceptance: the throwaway testnet builder (scripts/p2-10-throwaway.mjs) takes its
 * agent from 0 to 5 checks on /builders, in a real browser, and /owner returns
 * qualityListing true.
 *
 *   node scripts/p2-10-accept.mjs [--base=http://127.0.0.1:3299] [--out=docs/phase2/evidence]
 *
 * Wallet: scripts/headless-wallet.mjs (the key stays in Node and signs exactly what the
 * page asks: one personal_sign for the proof). Screens of every check state go to
 * docs/phase2/screens/p2-10/ (on the VPS, invariant 30).
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { attachWallet, connectInPage } from './headless-wallet.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const BASE = args.base ?? 'https://marque.trade'
const OUT = args.out ?? 'docs/phase2/evidence'
const SHOTS = 'docs/phase2/screens/p2-10'
mkdirSync(SHOTS, { recursive: true })
const fixture = JSON.parse(readFileSync('/root/.marque/test-wallets/p2-10-builder.json', 'utf8'))
const tokenId = fixture.agent.tokenId
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await ctx.addInitScript(() => { try { localStorage.setItem('marque-theme', 'night') } catch { /* none */ } })
const { address } = await attachWallet(ctx, { privateKey: fixture.privateKey, chainId: 97, log: (m) => log('wallet', m) })
const page = await ctx.newPage()
page.on('pageerror', (e) => log('PAGEERROR', e.message.slice(0, 200)))
const evidence = { base: BASE, wallet: address, chainId: 97, tokenId, startedAt: new Date().toISOString(), states: [] }
const card = () => page.locator('section[aria-labelledby="bc-title"]')
const record = async (step) => {
  const states = await card().locator('li[data-state]').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')))
  evidence.states.push({ step, states })
  log(step, states.join(' '))
  await page.screenshot({ path: join(SHOTS, `builders-${evidence.states.length}-${step}.png`), fullPage: true })
}
const click = async (name) => {
  await card().getByRole('button', { name }).click()
  await page.waitForTimeout(500)
  await card().getByRole('button', { name }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  // Wait for the action to finish: the note or error line appears and the button leaves loading.
  await page.waitForFunction(() => !document.querySelector('section[aria-labelledby="bc-title"] button[data-loading="true"]'), null, { timeout: 180000 })
  await page.waitForTimeout(1500)
}

try {
  await page.goto(`${BASE}/builders`, { waitUntil: 'networkidle', timeout: 90000 })
  await page.screenshot({ path: join(SHOTS, 'builders-0-no-wallet.png'), fullPage: true })
  await connectInPage(page)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: join(SHOTS, 'builders-0-connected.png'), fullPage: true })
  // The testnet identity is not in Marque's index, so look it up by token id.
  await page.locator('select[aria-label="Network"]').selectOption('97')
  await page.locator('#look-token').fill(String(tokenId))
  await page.getByRole('button', { name: /^check$/i }).click()
  await card().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1500)
  await record('found')
  const stateOf = async (i) => (await card().locator('li[data-state]').nth(i).getAttribute('data-state'))
  if ((await stateOf(1)) !== 'pass') { await click(/sign the proof/i); await record('proved') } else log('proved already (stored proof from an earlier run)')
  await click(/probe now/i); await record('probed')
  const sel = card().locator('select[aria-label="Declared category"]')
  await sel.selectOption('health_factor')
  if (await card().getByRole('button', { name: /^declare$/i }).isEnabled()) { await click(/^declare$/i); await record('declared') }
  if ((await stateOf(4)) !== 'pass') { await click(/run mcs-hf-1 now/i); await record('tested') }
  await card().getByText('Listed on Marque').first().waitFor({ timeout: 30000 })
  await record('listed')
  const owner = await (await fetch(`${BASE}/api/v1/phase2/owner/${address}`)).json()
  evidence.owner = { qualityListing: owner.qualityListing, agents: owner.agents?.map((a) => ({ agentKey: a.agentKey, qualityListing: a.qualityListing, listedOnMarque: a.listedOnMarque, checks: a.quality.checks.map((c) => `${c.id}:${c.state}`) })) }
  log('owner API qualityListing', owner.qualityListing)
  // The quest API is served from a 15 s projection: poll past it.
  let quest = null
  for (let i = 0; i < 8; i++) {
    quest = await (await fetch(`${BASE}/api/v1/phase2/wallet/${address}`)).json()
    if (quest.quest?.ownAgentListed?.done) break
    await new Promise((r) => setTimeout(r, 5000))
  }
  evidence.questOwnAgentListed = quest?.quest?.ownAgentListed
  log('quest ownAgentListed', JSON.stringify(quest?.quest?.ownAgentListed))
} catch (e) {
  log('FAILED', e.message.split('\n')[0])
  evidence.error = e.message.split('\n')[0]
  await page.screenshot({ path: join(SHOTS, 'builders-failure.png'), fullPage: true }).catch(() => {})
} finally {
  evidence.finishedAt = new Date().toISOString()
  await browser.close()
  writeFileSync(join(OUT, 'p2-10-accept.json'), JSON.stringify(evidence, null, 2))
  log('evidence', join(OUT, 'p2-10-accept.json'))
}
