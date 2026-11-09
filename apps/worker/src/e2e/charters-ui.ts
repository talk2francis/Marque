/// <reference lib="dom" />
/**
 * Charters readiness cells through the real site (Q7, Q8): grant with the builder and the Seal, wait for the agent's
 * own action, then End and clear from the charter page, in one browser session.
 *
 *   node --import tsx src/e2e/charters-ui.ts <loan|yield|grid|range> <browser|pass> <97|56> <outDir> [ownerKeystoreDir]
 *
 * browser: an EIP-6963 wallet injected into the page, backed by a keystore held in this Node process.
 * pass:    Marque Pass created on a Chrome virtual authenticator with PRF; the Pass key is read once through the site's
 *          own Export key flow (testnet throwaways, or a mainnet Pass funded with cents) so this process can set up the
 *          position the charter needs. Keys are never printed.
 * Setup per kind: loan = Venus loan (supply BNB, borrow USDT); yield = USDC; grid and range = fixture tokens (97).
 */
import { chromium, type Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, encodeFunctionData, http, numberToHex, parseAbi, parseEther, type Abi, type Hex, type PrivateKeyAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { loadKeystore } from '@marque/commerce'
import { CHARTER_CHAINS, V2 } from '@marque/charters'

const [kind, walletType, chainArg, out, ownerDir] = process.argv.slice(2) as ['loan' | 'yield' | 'grid' | 'range', 'browser' | 'pass', string, string, string | undefined]
const chainId = Number(chainArg) as 56 | 97
const BASE = process.env['E2E_BASE'] ?? 'http://127.0.0.1:3290'
const RPC = chainId === 97 ? 'https://bsc-testnet-rpc.publicnode.com' : 'https://bsc-dataseed.bnbchain.org'
const chain = chainId === 97 ? bscTestnet : bsc
const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 30_000 }) })
const funder = privateKeyToAccount(loadKeystore('/root/.marque/charters/deployer-v2'))
const gasPrice = chainId === 97 ? 500_000_000n : undefined
mkdirSync(out, { recursive: true })
const report: Record<string, unknown> = { kind, walletType, chainId, steps: [] as string[] }
const step = (s: string) => { (report['steps'] as string[]).push(`${new Date().toISOString()} ${s}`); console.log(s) }

async function send(acc: PrivateKeyAccount, to: Hex, data: Hex | undefined, value: bigint, what: string) {
  const w = createWalletClient({ account: acc, chain, transport: http(RPC, { timeout: 30_000 }) })
  const hash = await w.sendTransaction({ to, data, value, gasPrice })
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 })
  step(`${what}: ${r.status} ${hash}`)
  if (r.status !== 'success') throw new Error(`${what} reverted`)
}
const call = (abi: string, fn: string, args: unknown[]): Hex =>
  encodeFunctionData({ abi: parseAbi([abi]) as Abi, functionName: fn, args } as Parameters<typeof encodeFunctionData>[0])

/** What the charter needs in the owner's account, set up from this process (testnet faucets). */
async function setup(acc: PrivateKeyAccount) {
  if (chainId !== 97) return // mainnet setups are prepared by the Q8 table, never here
  const m = CHARTER_CHAINS[97].markets
  if (kind === 'loan') {
    const debt = await pub.readContract({ address: m[0]!.vToken, abi: parseAbi(['function borrowBalanceStored(address) view returns (uint256)']), functionName: 'borrowBalanceStored', args: [acc.address] })
    if (debt > 0n) { step('loan already set up'); return }
    await send(acc, m[0]!.token, call('function allocateTo(address,uint256)', 'allocateTo', [acc.address, 1_000n * 10n ** 6n]), 0n, 'faucet USDT')
    await send(acc, '0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c', call('function mint() payable', 'mint', []), parseEther('0.003'), 'supply tBNB to vBNB')
    await send(acc, CHARTER_CHAINS[97].comptroller, call('function enterMarkets(address[]) returns (uint256[])', 'enterMarkets', [['0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c']]), 0n, 'enter vBNB')
    const [, liq] = await pub.readContract({ address: CHARTER_CHAINS[97].comptroller, abi: parseAbi(['function getAccountLiquidity(address) view returns (uint256,uint256,uint256)']), functionName: 'getAccountLiquidity', args: [acc.address] })
    await send(acc, m[0]!.vToken, call('function borrow(uint256) returns (uint256)', 'borrow', [liq / 2n / 10n ** 12n]), 0n, 'borrow USDT')
  } else if (kind === 'yield') {
    await send(acc, m[1]!.token, call('function allocateTo(address,uint256)', 'allocateTo', [acc.address, 300n * 10n ** 6n]), 0n, 'faucet USDC')
  } else {
    const p = V2[97].pools[0]!
    await send(acc, p.quote, call('function faucet(address,uint256)', 'faucet', [acc.address, 2_000n * 10n ** 18n]), 0n, 'faucet tUSDT')
    await send(acc, p.base, call('function faucet(address,uint256)', 'faucet', [acc.address, 3n * 10n ** 18n]), 0n, 'faucet tWBNB')
    if (kind === 'range') {
      const [, tick] = await pub.readContract({ address: p.address, abi: parseAbi(['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)']), functionName: 'slot0' })
      const [t0, t1] = p.base.toLowerCase() < p.quote.toLowerCase() ? [p.base, p.quote] : [p.quote, p.base]
      for (const t of [t0, t1]) await send(acc, t, call('function approve(address,uint256) returns (bool)', 'approve', [V2[97].npm, 10n ** 30n]), 0n, 'approve NPM')
      const lower = Math.floor((tick - 300) / 10) * 10
      const amt = (t: string) => (t === p.quote ? 500n * 10n ** 18n : 10n ** 18n)
      await send(acc, V2[97].npm, call('function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) payable returns (uint256,uint128,uint256,uint256)', 'mint',
        [[t0, t1, p.fee, lower, lower + 600, amt(t0), amt(t1), 0n, 0n, acc.address, BigInt(Math.floor(Date.now() / 1000) + 900)]]), 0n, 'mint a 600-tick position')
      for (const t of [t0, t1]) await send(acc, t, call('function approve(address,uint256) returns (bool)', 'approve', [V2[97].npm, 0n]), 0n, 'clear NPM approval')
    }
  }
}

async function injectWallet(page: Page, acc: PrivateKeyAccount) {
  const w = createWalletClient({ account: acc, chain, transport: http(RPC, { timeout: 30_000 }) })
  const batches = new Map<string, Hex[]>()
  await page.exposeFunction('__mqWallet', async (method: string, params: unknown[]) => {
    try {
      const v = await (async () => {
        switch (method) {
          case 'eth_requestAccounts': case 'eth_accounts': return [acc.address]
          case 'eth_chainId': return numberToHex(chainId)
          case 'net_version': return String(chainId)
          case 'wallet_switchEthereumChain': return null
          case 'wallet_getCapabilities': return { [numberToHex(chainId)]: { atomic: { status: 'unsupported' } } }
          case 'eth_sendTransaction': { const t = params[0] as { to: Hex; data?: Hex; value?: Hex }; return w.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, gasPrice }) }
          case 'wallet_sendCalls': {
            const req = params[0] as { calls: Array<{ to: Hex; data?: Hex; value?: Hex }> }
            const hashes: Hex[] = []
            let nonce = await pub.getTransactionCount({ address: acc.address, blockTag: 'pending' })
            for (const c of req.calls) {
              const value = c.value ? BigInt(c.value) : 0n
              const gas = await pub.estimateGas({ account: acc.address, to: c.to, data: c.data, value }).then((g) => g * 13n / 10n).catch(() => 3_500_000n)
              hashes.push(await w.sendTransaction({ to: c.to, data: c.data, value, gas, gasPrice, nonce: nonce++ }))
            }
            const id = `0x${Date.now().toString(16).padStart(64, '0')}`
            batches.set(id, hashes)
            return { id }
          }
          case 'wallet_getCallsStatus': {
            const hashes = batches.get(params[0] as string) ?? []
            const rs = await Promise.all(hashes.map((h) => pub.getTransactionReceipt({ hash: h }).catch(() => null)))
            const done = rs.every((r) => r)
            return { version: '2.0.0', id: params[0], chainId: numberToHex(chainId), atomic: false, status: !done ? 100 : rs.every((r) => r!.status === 'success') ? 200 : 600,
              receipts: rs.filter((r) => r).map((r) => ({ logs: [], status: r!.status === 'success' ? '0x1' : '0x0', blockHash: r!.blockHash, blockNumber: numberToHex(r!.blockNumber), gasUsed: numberToHex(r!.gasUsed), transactionHash: r!.transactionHash })) }
          }
          default: return pub.request({ method: method as 'eth_call', params: params as never })
        }
      })()
      return { ok: true, value: JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? numberToHex(x) : x))) }
    } catch (e) { return { ok: false, code: (e as { code?: number }).code ?? -32603, message: (e as Error).message.slice(0, 300) } }
  })
  await page.addInitScript(() => {
    const listeners: Record<string, Array<(...a: unknown[]) => void>> = {}
    const provider = {
      isMetaMask: false,
      async request({ method, params }: { method: string; params?: unknown[] }) {
        const r = await (window as unknown as { __mqWallet: (m: string, p: unknown) => Promise<{ ok: boolean; value?: unknown; code?: number; message?: string }> }).__mqWallet(method, params ?? [])
        if (r.ok) return r.value
        throw Object.assign(new Error(r.message), { code: r.code })
      },
      on(e: string, l: (...a: unknown[]) => void) { (listeners[e] ??= []).push(l) },
      removeListener(e: string, l: (...a: unknown[]) => void) { listeners[e] = (listeners[e] ?? []).filter((x) => x !== l) },
    }
    ;(window as unknown as { ethereum: unknown }).ethereum = provider
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: '6a1c0e2e-0000-4000-8000-000000000097', name: 'Test Wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'trade.marque.testwallet' }, provider }) }))
    window.addEventListener('eip6963:requestProvider', announce)
    announce()
  })
}

const ready = (page: Page) => page.waitForFunction(() => { const el = document.querySelector('[class*="hfValue"]'); return Boolean(el && el.textContent && el.textContent !== '…') }, null, { timeout: 240_000 })

async function connect(page: Page, name: 'Test Wallet' | 'Marque Pass') {
  // An injected wallet that already answers eth_accounts is connected by wagmi on its own: wait for that first.
  if (name === 'Test Wallet') {
    const auto = await page.waitForFunction(() => !/Connect the wallet that owns/.test(document.body.innerText), null, { timeout: 15_000 }).then(() => true).catch(() => false)
    if (auto) return
  }
  // Otherwise open the modal until the wallet list shows.
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /^Connect/ }).last().click()
    if (await page.getByText(name, { exact: false }).first().isVisible({ timeout: 8_000 }).catch(() => false)) break
    await page.keyboard.press('Escape').catch(() => undefined)
    await page.waitForTimeout(2_000)
  }
  await page.getByText(name, { exact: false }).first().click({ timeout: 30_000 })
}

let lastPage: Page | null = null
async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  lastPage = page
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  const shot = (n: string) => page.screenshot({ path: `${out}/${kind}-${walletType}-${n}.png` })
  const builder = `${BASE}/charters/new?kind=${kind}&chain=${chainId}`
  let owner: PrivateKeyAccount
  if (walletType === 'browser') {
    owner = privateKeyToAccount(loadKeystore(ownerDir ?? '/root/.marque/charters/e2e-owner-97'))
    await setup(owner)
    await injectWallet(page, owner)
    await page.goto(builder, { waitUntil: 'domcontentloaded', timeout: 300_000 })
    await ready(page)
    await connect(page, 'Test Wallet')
  } else {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('WebAuthn.enable', { enableUI: false })
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } })
    await page.goto(builder, { waitUntil: 'domcontentloaded', timeout: 300_000 })
    await ready(page)
    await connect(page, 'Marque Pass')
    await page.getByRole('button', { name: 'Create a Marque Pass' }).click({ timeout: 60_000 }) // create the Pass on this device
    const rec = await page.waitForFunction(() => localStorage.getItem('marque:pass:v1'), null, { timeout: 60_000 }).then((h) => h.jsonValue()) as string
    const address = JSON.parse(rec).address as Hex
    step(`Pass created ${address}`)
    // Fund the Pass for gas, then read its key through the site's own Export key flow (never printed).
    await send(funder, address, undefined, chainId === 97 ? parseEther('0.008') : parseEther(process.env['E2E_PASS_BNB'] ?? '0.002'), 'fund the Pass with BNB for gas')
    await page.getByRole('button', { name: new RegExp(address.slice(2, 6), 'i') }).first().click().catch(async () => { await page.locator('header button').filter({ hasText: /0x/ }).first().click() })
    await page.getByRole('menuitem', { name: 'Export key' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm with passkey' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Reveal' }).click()
    const key = (await page.getByRole('dialog').locator('code').first().innerText()).trim() as Hex
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
    owner = privateKeyToAccount(key)
    if (owner.address.toLowerCase() !== address.toLowerCase()) throw new Error('exported key does not match the Pass address')
    await setup(owner)
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  report['owner'] = owner.address
  await ready(page)
  await page.waitForFunction(() => !/Connect the wallet that owns/.test(document.body.innerText), null, { timeout: 60_000 })
  if (kind === 'loan') {
    await page.getByRole('button', { name: 'Test it now' }).click()
    await page.fill('#budget', '3')
  }
  await page.waitForTimeout(1500)
  await shot('builder')
  const blocker = await page.locator('[class*="blocker"]').first().innerText().catch(() => '')
  if (blocker) step(`blocker: ${blocker}`)
  await page.getByRole('button', { name: 'Grant a charter' }).first().click()
  const seal = page.getByRole('dialog').first()
  await seal.waitFor({ timeout: 180_000 })
  await page.waitForTimeout(1200)
  await shot('seal')
  await seal.getByRole('button', { name: /Open your wallet|Seal with your fingerprint/ }).click()
  if (walletType === 'pass') await page.getByRole('button', { name: /^Confirm/ }).last().click({ timeout: 60_000 })
  await page.getByRole('link', { name: 'Open the charter' }).waitFor({ timeout: 420_000 })
  const href = await page.getByRole('link', { name: 'Open the charter' }).getAttribute('href')
  await shot('granted')
  step(`granted ${href}`)
  report['charter'] = href
  // Wait for a real action by the worker (grid and range wait for the fixture market maker).
  const [, , , addr] = (href ?? '').split('/')
  const until = Date.now() + (kind === 'grid' || kind === 'range' ? 60 : 12) * 60_000
  let actions = 0
  while (Date.now() < until) {
    const d = await fetch(`${BASE}/api/v1/guards/${chainId}/${addr}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { charter?: { actions: number } } | null
    actions = d?.charter?.actions ?? 0
    if (actions > 0) break
    await new Promise((r) => setTimeout(r, 30_000))
  }
  step(`actions observed: ${actions}`)
  report['actions'] = actions
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'End charter' }).first().waitFor({ timeout: 120_000 })
  await shot('page')
  await page.getByRole('button', { name: 'End charter' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'End charter' }).click()
  if (walletType === 'pass') await page.getByRole('button', { name: /^Confirm/ }).last().click({ timeout: 60_000 })
  // Confirmed from the index, not from the page's own refresh.
  const endBy = Date.now() + 300_000
  while (Date.now() < endBy) {
    const d = await fetch(`${BASE}/api/v1/guards/${chainId}/${addr}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { charter?: { status: string }; allowances?: Array<{ allowance: string | null }> } | null
    if (d?.charter?.status === 'ended') { report['allowancesAfter'] = d.allowances?.map((a) => a.allowance); break }
    await new Promise((r) => setTimeout(r, 10_000))
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await shot('ended')
  step('ended from the charter page')
  report['errors'] = errors
  writeFileSync(`${out}/${kind}-${walletType}-${chainId}.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
main().catch(async (e) => { step(`FAILED: ${(e as Error).message.slice(0, 300)}`); await lastPage?.screenshot({ path: `${out}/${kind}-${walletType}-failed.png` }).catch(() => undefined); writeFileSync(`${out}/${kind}-${walletType}-${chainId}.json`, JSON.stringify(report, null, 2)); process.exit(1) })
