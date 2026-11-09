/**
 * Charters v2 end-to-end on BSC TESTNET (Q3, Q7). Refuses any other chain. The owner is a fresh testnet-only
 * keystore; tokens come from testnet faucets (Venus USDT and USDC allocateTo, Marque fixture tUSDT and tWBNB).
 *
 *   node --import tsx src/e2e/charters-v2-97.ts <loan|yield|grid|range|drive <tick>|status|end <address>>
 *
 * Created charters are recorded in /root/marque-charters-pack/probe/q3-97.json (outside the repo).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createPublicClient, createWalletClient, encodeAbiParameters, http, maxUint256, parseAbi, parseEther, type Abi, type AbiParameter, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { loadKeystore } from '@marque/commerce'
import {
  V2, EXECUTORS, CHARTER_CHAINS, loanGuardFactoryV2Abi, yieldSweepFactoryAbi, gridBandFactoryAbi, rangeKeeperFactoryAbi,
  loanGuardV2Abi, yieldSweepAbi, gridBandAbi, rangeKeeperAbi,
} from '@marque/charters'

const DIR = '/root/.marque/charters'
const OUT = '/root/marque-charters-pack/probe/q3-97.json'
const RPC = 'https://bsc-testnet-rpc.publicnode.com'
const GAS = { gasPrice: 500_000_000n } as const
const pub = createPublicClient({ chain: bscTestnet, transport: http(RPC, { timeout: 30_000 }) })
const owner = privateKeyToAccount(loadKeystore(`${DIR}/${process.env['E2E_OWNER'] ?? 'e2e-owner-97'}`))
const w = createWalletClient({ account: owner, chain: bscTestnet, transport: http(RPC, { timeout: 30_000 }) })
const c97 = V2[97]
const pool = c97.pools[0]!
const erc20 = parseAbi(['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function allocateTo(address,uint256)', 'function faucet(address,uint256)', 'function allowance(address,address) view returns (uint256)'])
const venus = parseAbi([
  'function mint() payable', 'function borrow(uint256) returns (uint256)', 'function enterMarkets(address[]) returns (uint256[])',
  'function getAccountLiquidity(address) view returns (uint256,uint256,uint256)',
])
const poolAbi = parseAbi(['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)', 'function tickSpacing() view returns (int24)'])
const npmAbi = parseAbi([
  'function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) payable returns (uint256,uint128,uint256,uint256)',
  'function safeTransferFrom(address,address,uint256,bytes)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
])
const V_BNB: Address = '0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c'
const usdt = CHARTER_CHAINS[97].markets[0]!
const usdc = CHARTER_CHAINS[97].markets[1]!
const days = (n: number) => BigInt(Math.floor(Date.now() / 1000) + n * 86_400)
type Rec = Record<string, { address: string; tx: string; at: string; [k: string]: unknown }>
const rec = (): Rec => (existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {})
const save = (k: string, v: Rec[string]) => { const r = rec(); r[k] = v; writeFileSync(OUT, JSON.stringify(r, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2)) }

async function send(p: Promise<Hex>, what: string): Promise<Hex> {
  const hash = await p
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 })
  console.log(`${what}: ${r.status} ${hash}`)
  if (r.status !== 'success') throw new Error(`${what} reverted`)
  return hash
}
const approve = (token: Address, spender: Address, amount: bigint, what: string) => send(w.writeContract({ address: token, abi: erc20, functionName: 'approve', args: [spender, amount], ...GAS }), what)

async function loan() {
  const debt = await pub.readContract({ address: usdt.vToken, abi: parseAbi(['function borrowBalanceStored(address) view returns (uint256)']), functionName: 'borrowBalanceStored', args: [owner.address] })
  if (debt === 0n) await loanSetup()
  await loanCreate()
}

async function loanSetup() {
  await send(w.writeContract({ address: usdt.token, abi: erc20, functionName: 'allocateTo', args: [owner.address, 1_000n * 10n ** 6n], ...GAS }), 'faucet USDT')
  await send(w.writeContract({ address: V_BNB, abi: venus, functionName: 'mint', value: parseEther('0.004'), ...GAS }), 'supply 0.004 tBNB to vBNB')
  await send(w.writeContract({ address: CHARTER_CHAINS[97].comptroller, abi: venus, functionName: 'enterMarkets', args: [[V_BNB]], ...GAS }), 'enterMarkets vBNB')
  const [, liq] = await pub.readContract({ address: CHARTER_CHAINS[97].comptroller, abi: venus, functionName: 'getAccountLiquidity', args: [owner.address] })
  const borrow = liq * 2n / 3n / 10n ** 12n // health about 1.5 (USD 1e18 to USDT 6 decimals at about 1 USD)
  await send(w.writeContract({ address: usdt.vToken, abi: venus, functionName: 'borrow', args: [borrow], ...GAS }), `borrow ${borrow} USDT units`)
}

async function loanCreate() {
  const a = { p: { vDebt: usdt.vToken, trigger: parseEther(process.env['E2E_TRIGGER'] ?? '1.6'), target: parseEther(process.env['E2E_TARGET'] ?? '1.8'), budget: 5n * 10n ** 6n, minRepay: 10_000n }, expiresAt: days(2), tipPerAction: 0n, tipBudget: 0n }
  const salt = `0x${Date.now().toString(16).padStart(64, '0')}` as Hex
  const predicted = await pub.readContract({ address: c97.loanFactory!, abi: loanGuardFactoryV2Abi, functionName: 'predict', args: [owner.address, a, salt] })
  await approve(usdt.token, predicted, a.p.budget, 'approve USDT budget to the predicted guard')
  const tx = await send(w.writeContract({ address: c97.loanFactory!, abi: loanGuardFactoryV2Abi, functionName: 'create', args: [a, salt], ...GAS }), 'create Loan Guard v2')
  save(process.env['E2E_KEY'] ?? 'loan', { address: predicted, tx, at: new Date().toISOString(), token: usdt.token })
  console.log('loan guard', predicted)
}

async function yieldSweep() {
  const held = await pub.readContract({ address: usdc.token, abi: erc20, functionName: 'balanceOf', args: [owner.address] })
  if (held < 150n * 10n ** 6n) await send(w.writeContract({ address: usdc.token, abi: erc20, functionName: 'allocateTo', args: [owner.address, 300n * 10n ** 6n], ...GAS }), 'faucet USDC')
  const u = 10n ** 6n
  const a = { p: { vToken: usdc.vToken, floor: 50n * u, ceiling: 100n * u, minAction: 10n * u, supplyCap: 1_000n * u, minHealthAfter: 0n }, expiresAt: days(2), tipPerAction: 0n, tipBudget: 0n }
  const salt = `0x${Date.now().toString(16).padStart(64, '0')}` as Hex
  const predicted = await pub.readContract({ address: c97.yieldFactory!, abi: yieldSweepFactoryAbi, functionName: 'predict', args: [owner.address, a, salt] })
  const vAllow = await pub.readContract({ address: c97.yieldFactory!, abi: yieldSweepFactoryAbi, functionName: 'vTokenAllowanceFor', args: [usdc.vToken, a.p.supplyCap] })
  await approve(usdc.token, predicted, a.p.supplyCap, 'approve USDC supply cap')
  await approve(usdc.vToken, predicted, vAllow, 'approve vUSDC withdrawals')
  const tx = await send(w.writeContract({ address: c97.yieldFactory!, abi: yieldSweepFactoryAbi, functionName: 'create', args: [a, salt], ...GAS }), 'create Yield Sweep')
  save('yield', { address: predicted, tx, at: new Date().toISOString(), token: usdc.token, vToken: usdc.vToken })
  console.log('yield sweep', predicted)
}

async function grid() {
  await send(w.writeContract({ address: pool.quote, abi: erc20, functionName: 'faucet', args: [owner.address, 2_000n * 10n ** 18n], ...GAS }), 'faucet tUSDT')
  await send(w.writeContract({ address: pool.base, abi: erc20, functionName: 'faucet', args: [owner.address, 3n * 10n ** 18n], ...GAS }), 'faucet tWBNB')
  const [, tick] = await pub.readContract({ address: pool.address, abi: poolAbi, functionName: 'slot0' })
  const baseIs0 = pool.base.toLowerCase() < pool.quote.toLowerCase()
  const bt = baseIs0 ? tick : -tick
  const minStep = await pub.readContract({ address: c97.gridFactory!, abi: gridBandFactoryAbi, functionName: 'minStep', args: [pool.address, 30] })
  const step = Math.max(Number(minStep), 100)
  const a = {
    p: { pool: pool.address, base: pool.base, lowerBt: bt - 4 * step - Math.floor(step / 2), stepTicks: step, slots: 8, orderQuote: 100n * 10n ** 18n, baseOrder: 15n * 10n ** 16n,
      buyCap: 1_000n * 10n ** 18n, sellCap: 3n * 10n ** 18n, twapWindow: 120, maxDeviation: 20, slipTicks: 30, minFillBps: 5_000 },
    expiresAt: days(2), tipToken: pool.quote, tipPerAction: 0n, tipBudget: 0n, executors: [EXECUTORS.lattice, EXECUTORS.backup], fullFrom: 0,
  }
  a.fullFrom = await pub.readContract({ address: c97.gridFactory!, abi: gridBandFactoryAbi, functionName: 'fullFromNow', args: [a.p] })
  const salt = `0x${Date.now().toString(16).padStart(64, '0')}` as Hex
  const predicted = await pub.readContract({ address: c97.gridFactory!, abi: gridBandFactoryAbi, functionName: 'predict', args: [owner.address, a, salt] })
  await approve(pool.quote, predicted, a.p.buyCap, 'approve tUSDT buy cap')
  await approve(pool.base, predicted, a.p.sellCap, 'approve tWBNB sell cap')
  const tx = await send(w.writeContract({ address: c97.gridFactory!, abi: gridBandFactoryAbi, functionName: 'create', args: [a, salt], ...GAS }), 'create Grid Band')
  save('grid', { address: predicted, tx, at: new Date().toISOString(), lowerBt: a.p.lowerBt, step, fullFrom: a.fullFrom })
  console.log('grid band', predicted, 'step', step, 'fullFrom', a.fullFrom)
}

async function range() {
  const [t0, t1] = pool.base.toLowerCase() < pool.quote.toLowerCase() ? [pool.base, pool.quote] : [pool.quote, pool.base]
  for (const t of [t0, t1]) {
    await send(w.writeContract({ address: t, abi: erc20, functionName: 'faucet', args: [owner.address, t === pool.quote ? 1_000n * 10n ** 18n : 2n * 10n ** 18n], ...GAS }), 'faucet')
    await approve(t, c97.npm, maxUint256, 'approve NPM for the mint')
  }
  const [, tick] = await pub.readContract({ address: pool.address, abi: poolAbi, functionName: 'slot0' })
  const sp = await pub.readContract({ address: pool.address, abi: poolAbi, functionName: 'tickSpacing' })
  const lower = Math.floor((tick - 200) / sp) * sp
  const mintHash = await send(w.writeContract({ address: c97.npm, abi: npmAbi, functionName: 'mint', args: [[t0, t1, pool.fee, lower, lower + 400, t0 === pool.quote ? 500n * 10n ** 18n : 10n ** 18n, t1 === pool.quote ? 500n * 10n ** 18n : 10n ** 18n, 0n, 0n, owner.address, days(1)]], ...GAS }), 'mint a narrow position')
  for (const t of [t0, t1]) await approve(t, c97.npm, 0n, 'clear the NPM approval')
  const r = await pub.getTransactionReceipt({ hash: mintHash })
  const log = r.logs.find((l) => l.address.toLowerCase() === c97.npm.toLowerCase() && l.topics.length === 4)!
  const id = BigInt(log.topics[3]!)
  const created = (rangeKeeperFactoryAbi as Abi).find((x) => x.type === 'event' && x.name === 'Created') as unknown as { inputs: AbiParameter[] }
  const createType = created.inputs.find((i) => i.name === 'params')!
  const create = {
    p: { pool: pool.address, mode: 0, feesToOwner: true, twapWindow: 300, maxDeviation: 20, slipTicks: 50, bufferTicks: 20, maxLossBps: 100, maxLeftoverBps: 500, minInterval: 600, maxRebalances: 5 },
    expiresAt: days(2), tipToken: pool.quote, tipPerAction: 0n, tipBudget: 0n, executors: [EXECUTORS.bound, EXECUTORS.backup], userSalt: `0x${Date.now().toString(16).padStart(64, '0')}` as Hex,
  }
  const data = encodeAbiParameters([createType], [create])
  const tx = await send(w.writeContract({ address: c97.npm, abi: npmAbi, functionName: 'safeTransferFrom', args: [owner.address, c97.rangeFactory!, id, data], ...GAS }), 'grant: send the position to the Range Keeper factory')
  const rr = await pub.getTransactionReceipt({ hash: tx })
  const moved = rr.logs.filter((l) => l.address.toLowerCase() === c97.npm.toLowerCase() && l.topics.length === 4)
  const keeper = `0x${moved[moved.length - 1]!.topics[2]!.slice(26)}`
  save('range', { address: keeper, tx, at: new Date().toISOString(), tokenId: id.toString(), lower, upper: lower + 400 })
  console.log('range keeper', keeper, 'position', id)
}

async function drive(target: number) {
  const mm = process.env['CHARTERS_FIXTURE_MM'] as Address
  const op = createWalletClient({ account: privateKeyToAccount(loadKeystore(`${DIR}/fixture-mm-97`)), chain: bscTestnet, transport: http(RPC) })
  await send(op.writeContract({ address: mm, abi: parseAbi(['function moveTo(int24)']), functionName: 'moveTo', args: [target], ...GAS }), `fixture market maker to tick ${target}`)
}

const ABIS = { loan: loanGuardV2Abi, yield: yieldSweepAbi, grid: gridBandAbi, range: rangeKeeperAbi } as const
async function status() {
  const r = rec()
  const [, tick] = await pub.readContract({ address: pool.address, abi: poolAbi, functionName: 'slot0' })
  console.log('fixture pool tick', tick)
  for (const k of ['loan', 'yield', 'grid', 'range'] as const) {
    if (!r[k]) continue
    const p = await pub.readContract({ address: r[k]!.address as Address, abi: ABIS[k] as Abi, functionName: 'preview' }).catch((e: Error) => e.message.slice(0, 120))
    console.log(k, r[k]!.address, JSON.stringify(p, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))
  }
}

async function end(addr: Address) {
  await send(w.writeContract({ address: addr, abi: parseAbi(['function end()']), functionName: 'end', ...GAS }), `end ${addr}`)
}

async function main() {
  if ((await pub.getChainId()) !== 97) throw new Error('testnet only')
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === 'loan') await loan()
  else if (cmd === 'yield') await yieldSweep()
  else if (cmd === 'grid') await grid()
  else if (cmd === 'range') await range()
  else if (cmd === 'drive') await drive(Number(arg))
  else if (cmd === 'status') await status()
  else if (cmd === 'end') await end(arg as Address)
  else throw new Error('usage: loan | yield | grid | range | drive <tick> | status | end <address>')
}
main().catch((e) => { console.error(e instanceof Error ? e.message.slice(0, 400) : e); process.exit(1) })
