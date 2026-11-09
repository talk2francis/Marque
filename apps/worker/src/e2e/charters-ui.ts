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
import { createCipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { keccak256, toHex } from 'viem'
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
  const gas = (await pub.estimateGas({ account: acc.address, to, data, value })) * 13n / 10n // a tick-initialising mint once used exactly its estimate
  const hash = await w.sendTransaction({ to, data, value, gasPrice, gas })
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 })
  step(`${what}: ${r.status} ${hash}`)
  if (r.status !== 'success') throw new Error(`${what} reverted`)
}
const call = (abi: string, fn: string, args: unknown[]): Hex =>
  encodeFunctionData({ abi: parseAbi([abi]) as Abi, functionName: fn, args } as Parameters<typeof encodeFunctionData>[0])

/** What the charter needs in the owner's account, set up from this process (testnet faucets). */
const demo56 = () => privateKeyToAccount(loadKeystore('/root/.marque/charters/demo-wallet'))
const M56 = { USDT: '0x55d398326f99059fF775485246999027B3197955', USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', VBNB: '0xA07c5b74C9B40447a954e1466938b865b6BBea36' } as const

/** Mainnet Pass cells (grant and end with cents): the position comes from Marque's demo wallet, never anyone else's. */
async function setup56(acc: PrivateKeyAccount) {
  const d = demo56()
  const give = (t: Hex, v: bigint, what: string) => send(d, t, call('function transfer(address,uint256) returns (bool)', 'transfer', [acc.address, v]), 0n, what)
  if (kind === 'loan') {
    await send(acc, M56.VBNB, call('function mint() payable', 'mint', []), parseEther('0.002'), 'supply 0.002 BNB to Venus')
    await send(acc, CHARTER_CHAINS[56].comptroller, call('function enterMarkets(address[]) returns (uint256[])', 'enterMarkets', [[M56.VBNB]]), 0n, 'use it as collateral')
    await send(acc, CHARTER_CHAINS[56].markets[0]!.vToken, call('function borrow(uint256) returns (uint256)', 'borrow', [parseEther('0.3')]), 0n, 'borrow 0.3 USDT')
  } else if (kind === 'yield') {
    await give(M56.USDC, parseEther('1.2'), 'demo gives the Pass 1.2 USDC')
  } else if (kind === 'grid') {
    await give(M56.USDT, parseEther('5'), 'demo gives the Pass 5 USDT')
  } else {
    await give(M56.USDT, parseEther('2.5'), 'demo gives the Pass 2.5 USDT')
    await give(M56.WBNB, parseEther('0.004'), 'demo gives the Pass 0.004 WBNB')
    const pool = V2[56].pools[0]!
    const [, tick] = await pub.readContract({ address: pool.address, abi: parseAbi(['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)']), functionName: 'slot0' })
    const [t0, t1] = pool.base.toLowerCase() < pool.quote.toLowerCase() ? [pool.base, pool.quote] : [pool.quote, pool.base]
    const amt = (t: string) => (t.toLowerCase() === M56.USDT.toLowerCase() ? parseEther('2.5') : parseEther('0.004'))
    for (const t of [t0, t1]) await send(acc, t, call('function approve(address,uint256) returns (bool)', 'approve', [V2[56].npm, amt(t)]), 0n, 'allow the position manager for this mint')
    await send(acc, V2[56].npm, call('function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) payable returns (uint256,uint128,uint256,uint256)', 'mint',
      [[t0, t1, 100, tick - 250, tick + 250, amt(t0), amt(t1), 0n, 0n, acc.address, BigInt(Math.floor(Date.now() / 1000) + 900)]]), 0n, 'mint a 500-tick position')
    for (const t of [t0, t1]) await send(acc, t, call('function approve(address,uint256) returns (bool)', 'approve', [V2[56].npm, 0n]), 0n, 'clear the mint allowance')
  }
}

/** After End on mainnet: unwind the Pass's position and send everything back to Marque's deployer. */
async function unwind56(acc: PrivateKeyAccount) {
  const to = funder.address
  const balOf = (t: Hex) => pub.readContract({ address: t, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [acc.address] })
  if (kind === 'loan') {
    const vUSDT = CHARTER_CHAINS[56].markets[0]!.vToken
    // A full repayment includes interest accrued since the borrow: the demo wallet adds a cent so it can close.
    await send(demo56(), M56.USDT, call('function transfer(address,uint256) returns (bool)', 'transfer', [acc.address, parseEther('0.01')]), 0n, 'demo adds 0.01 USDT for accrued interest')
    await send(acc, M56.USDT, call('function approve(address,uint256) returns (bool)', 'approve', [vUSDT, await balOf(M56.USDT)]), 0n, 'allow the repayment')
    await send(acc, vUSDT, call('function repayBorrow(uint256) returns (uint256)', 'repayBorrow', [2n ** 256n - 1n]), 0n, 'repay the loan in full')
    await send(acc, M56.USDT, call('function approve(address,uint256) returns (bool)', 'approve', [vUSDT, 0n]), 0n, 'clear the repayment allowance')
    await send(acc, M56.VBNB, call('function redeem(uint256) returns (uint256)', 'redeem', [await balOf(M56.VBNB)]), 0n, 'redeem the BNB collateral')
  }
  if (kind === 'yield') {
    const v = CHARTER_CHAINS[56].markets[1]!.vToken
    const vb = await balOf(v)
    if (vb > 0n) await send(acc, v, call('function redeem(uint256) returns (uint256)', 'redeem', [vb]), 0n, 'redeem the vUSDC')
  }
  if (kind === 'range') {
    const npm = V2[56].npm
    const n = await pub.readContract({ address: npm, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [acc.address] })
    for (let i = 0n; i < n; i++) {
      const id = await pub.readContract({ address: npm, abi: parseAbi(['function tokenOfOwnerByIndex(address,uint256) view returns (uint256)']), functionName: 'tokenOfOwnerByIndex', args: [acc.address, 0n] })
      const pos = await pub.readContract({ address: npm, abi: parseAbi(['function positions(uint256) view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)']), functionName: 'positions', args: [id] })
      if (pos[7] > 0n) await send(acc, npm, call('function decreaseLiquidity((uint256,uint128,uint256,uint256,uint256)) returns (uint256,uint256)', 'decreaseLiquidity', [[id, pos[7], 0n, 0n, BigInt(Math.floor(Date.now() / 1000) + 900)]]), 0n, 'remove the liquidity')
      await send(acc, npm, call('function collect((uint256,address,uint128,uint128)) returns (uint256,uint256)', 'collect', [[id, to, 2n ** 128n - 1n, 2n ** 128n - 1n]]), 0n, 'collect it to the deployer')
      await send(acc, npm, call('function burn(uint256)', 'burn', [id]), 0n, 'burn the empty position')
    }
  }
  for (const t of [M56.USDT, M56.USDC, M56.WBNB]) { const b = await balOf(t); if (b > 0n) await send(acc, t, call('function transfer(address,uint256) returns (bool)', 'transfer', [to, b]), 0n, 'return tokens to the deployer') }
  const gp = await pub.getGasPrice()
  const left = await pub.getBalance({ address: acc.address }) - 21_000n * gp * 2n
  if (left > 0n) { const h = await createWalletClient({ account: acc, chain, transport: http(RPC) }).sendTransaction({ to, value: left, gas: 21_000n, gasPrice: gp }); await pub.waitForTransactionReceipt({ hash: h }); step(`return BNB to the deployer ${h}`) }
}

async function setup(acc: PrivateKeyAccount) {
  if (chainId === 56) return setup56(acc)
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

/** A mainnet Pass key is kept, encrypted (same format as charters-keystore.mjs), until its position is unwound. */
function keepKey(key: Hex, address: string) {
  const dir = `/root/.marque/charters/e2e-pass-${chainId}-${address.toLowerCase()}`
  mkdirSync(`${dir}/wallets`, { recursive: true, mode: 0o700 })
  const password = randomBytes(32).toString('base64url')
  const salt = randomBytes(32), iv = randomBytes(16)
  const dk = scryptSync(Buffer.from(password, 'utf8'), salt, 32, { N: 262144, r: 8, p: 1, maxmem: 512 * 1024 * 1024 })
  const c = createCipheriv('aes-128-ctr', dk.subarray(0, 16), iv)
  const ct = Buffer.concat([c.update(Buffer.from(key.slice(2), 'hex')), c.final()])
  const mac = keccak256(toHex(Buffer.concat([dk.subarray(16, 32), ct]))).slice(2)
  writeFileSync(`${dir}/wallets/pass.json`, JSON.stringify({ version: 3, id: randomUUID(), address: address.slice(2).toLowerCase(), crypto: { cipher: 'aes-128-ctr', cipherparams: { iv: iv.toString('hex') }, ciphertext: ct.toString('hex'), kdf: 'scrypt', kdfparams: { dklen: 32, n: 262144, r: 8, p: 1, salt: salt.toString('hex') }, mac } }), { mode: 0o600 })
  writeFileSync(`${dir}/.env.local`, `WALLET_PASSWORD=${password}\n`, { mode: 0o600 })
  step(`Pass key kept encrypted in ${dir}`)
}
let ownerForUnwind: PrivateKeyAccount | null = null

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
  if (process.env['E2E_UNWIND_DIR']) { await unwind56(privateKeyToAccount(loadKeystore(process.env['E2E_UNWIND_DIR']))); return }
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
    await send(funder, address, undefined, chainId === 97 ? parseEther(kind === 'loan' ? '0.008' : '0.006') : parseEther(process.env['E2E_PASS_BNB'] ?? '0.002'), 'fund the Pass with BNB for gas')
    await page.getByRole('button', { name: new RegExp(address.slice(2, 6), 'i') }).first().click().catch(async () => { await page.locator('header button').filter({ hasText: /0x/ }).first().click() })
    await page.getByRole('menuitem', { name: 'Export key' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm with passkey' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Reveal' }).click()
    const key = (await page.getByRole('dialog').locator('code').first().innerText()).trim() as Hex
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
    owner = privateKeyToAccount(key)
    if (owner.address.toLowerCase() !== address.toLowerCase()) throw new Error('exported key does not match the Pass address')
    if (chainId === 56) { keepKey(key, address); ownerForUnwind = owner }
    await setup(owner)
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  report['owner'] = owner.address
  await ready(page)
  await page.waitForFunction(() => !/Connect the wallet that owns/.test(document.body.innerText), null, { timeout: 60_000 })
  if (kind === 'loan') {
    await page.getByRole('button', { name: 'Test it now' }).click()
    await page.fill('#budget', chainId === 56 ? '0.2' : '3')
  }
  await page.waitForTimeout(1500)
  // A wallet on the other network: use the builder's own Switch network action, then wait for the blocker to clear.
  if (/Switch network/.test(await page.locator('[class*="blocker"]').first().innerText().catch(() => ''))) {
    await page.locator('[class*="blocker"]').getByRole('button', { name: 'Switch network' }).click()
    await page.waitForFunction(() => !/Switch network/.test(document.body.innerText), null, { timeout: 60_000 })
    await page.waitForTimeout(1500)
  }
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
  // Testnet grid and range: move Marque's labelled fixture pool past the charter's condition (R6), so the cell does
  // not depend on the random walk. Grid: the base price falls about 2.5%; range: the price leaves the range upward.
  if (chainId === 97 && (kind === 'grid' || kind === 'range') && process.env['CHARTERS_FIXTURE_MM']) {
    const pool = V2[97].pools[0]!
    const [, t] = await pub.readContract({ address: pool.address, abi: parseAbi(['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)']), functionName: 'slot0' })
    const op = privateKeyToAccount(loadKeystore('/root/.marque/charters/fixture-mm-97'))
    await send(op, process.env['CHARTERS_FIXTURE_MM'] as Hex, call('function moveTo(int24)', 'moveTo', [t + (kind === 'grid' ? 250 : 420)]), 0n, 'fixture market maker moves the test price')
  }
  // Wait for a real action by the worker (grid and range wait for the fixture market maker).
  const [, , , addr] = (href ?? '').split('/')
  const until = Date.now() + (chainId === 56 ? 3 : kind === 'grid' || kind === 'range' ? 60 : 12) * 60_000
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
  if (chainId === 56 && walletType === 'pass') await unwind56(owner)
  report['errors'] = errors
  writeFileSync(`${out}/${kind}-${walletType}-${chainId}.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
main().catch(async (e) => { step(`FAILED: ${(e as Error).message.slice(0, 300)}`); await lastPage?.screenshot({ path: `${out}/${kind}-${walletType}-failed.png` }).catch(() => undefined)
  // A failed mainnet run still returns everything it set up: end any charter this owner granted first, then unwind.
  if (chainId === 56 && ownerForUnwind) await unwind56(ownerForUnwind).catch((x) => step(`unwind failed: ${(x as Error).message.slice(0, 200)}`)); writeFileSync(`${out}/${kind}-${walletType}-${chainId}.json`, JSON.stringify(report, null, 2)); process.exit(1) })
