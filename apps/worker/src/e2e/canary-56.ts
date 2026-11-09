/**
 * Q8 mainnet canaries (BSC 56), Marque's own wallets only, under Francis's approval of 9 Nov 2026.
 *   node --import tsx src/e2e/canary-56.ts <fund|swap|loan|yield|grid|range|status>
 * Every write is simulated before it is sent (viem's writeContract estimates first); swaps carry a 1% minimum output;
 * approvals are exact. Created canaries are recorded in /root/marque-charters-pack/probe/canary-56.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, encodeAbiParameters, http, parseAbi, parseEther, type Abi, type AbiParameter, type Address, type Hex, type PrivateKeyAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc } from 'viem/chains'
import { loadKeystore } from '@marque/commerce'
import { CHARTER_CHAINS, EXECUTORS, V2, loanGuardFactoryV2Abi, yieldSweepFactoryAbi, gridBandFactoryAbi, rangeKeeperFactoryAbi } from '@marque/charters'

const RPC = 'https://bsc-dataseed.bnbchain.org'
const OUT = '/root/marque-charters-pack/probe/canary-56.json'
const pub = createPublicClient({ chain: bsc, transport: http(RPC, { timeout: 30_000 }) })
const wallet = (a: PrivateKeyAccount) => createWalletClient({ account: a, chain: bsc, transport: http(RPC, { timeout: 30_000 }) })
const deployer = privateKeyToAccount(loadKeystore('/root/.marque/charters/deployer-v2'))
const demo = privateKeyToAccount(loadKeystore('/root/.marque/charters/demo-wallet'))
const USDT: Address = '0x55d398326f99059fF775485246999027B3197955'
const USDC: Address = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
const WBNB: Address = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const V_BNB: Address = '0xA07c5b74C9B40447a954e1466938b865b6BBea36'
const ROUTER: Address = '0x1b81D678ffb9C0263b24A97847620C99d213eB14'
const POOL_USDT_100 = V2[56].pools[0]!
const c56 = V2[56]
const erc20 = parseAbi(['function approve(address,uint256) returns (bool)', 'function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'])
const poolAbi = parseAbi(['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)'])
const days = (n: number) => BigInt(Math.floor(Date.now() / 1000) + n * 86_400)
const salt = () => `0x${Date.now().toString(16).padStart(64, '0')}` as Hex
const rec = () => (existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {})
const save = (k: string, v: unknown) => { const r = rec(); r[k] = v; writeFileSync(OUT, JSON.stringify(r, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2)) }

async function tx(a: PrivateKeyAccount, p: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint }, what: string): Promise<Hex> {
  const { request } = await pub.simulateContract({ account: a, ...p } as Parameters<typeof pub.simulateContract>[0])
  // 30% over the estimate: a mint that initialises new ticks used exactly its estimate once and ran out (9 Nov).
  const gas = (await pub.estimateContractGas({ account: a, ...p } as Parameters<typeof pub.estimateContractGas>[0])) * 13n / 10n
  const hash = await wallet(a).writeContract({ ...(request as object), gas } as Parameters<ReturnType<typeof wallet>['writeContract']>[0])
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 })
  console.log(`${what}: ${r.status} ${hash}`)
  if (r.status !== 'success') throw new Error(`${what} reverted`)
  return hash
}
async function sendBnb(a: PrivateKeyAccount, to: Address, v: string, what: string) {
  const hash = await wallet(a).sendTransaction({ to, value: parseEther(v) })
  console.log(`${what}: ${(await pub.waitForTransactionReceipt({ hash })).status} ${hash}`)
}
const bal = (t: Address, w: Address) => pub.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [w] })

async function fund() {
  await sendBnb(deployer, EXECUTORS.lattice, '0.008', 'fund Lattice')
  await sendBnb(deployer, EXECUTORS.bound, '0.008', 'fund Bound')
  await sendBnb(deployer, EXECUTORS.sluicegate, '0.003', 'fund Sluicegate')
  await sendBnb(deployer, demo.address, '0.02', 'fund the demo wallet (gas and loan collateral)')
  await tx(deployer, { address: WBNB, abi: erc20 as Abi, functionName: 'transfer', args: [demo.address, await bal(WBNB, deployer.address)] }, 'WBNB to the demo wallet')
  await tx(deployer, { address: USDT, abi: erc20 as Abi, functionName: 'transfer', args: [demo.address, await bal(USDT, deployer.address)] }, 'USDT to the demo wallet')
}

/** WBNB to a stablecoin on a reviewed 0.01% pool, minimum output 1% under the pool's own price. */
async function swapTo(token: Address, pool: Address, wbnbIn: bigint) {
  const [sqrtP] = await pub.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' })
  const p = (Number(sqrtP) / 2 ** 96) ** 2 // token1 per token0
  const wbnbIs1 = WBNB.toLowerCase() > token.toLowerCase()
  const perWbnb = wbnbIs1 ? 1 / p : p // stablecoin per WBNB
  const minOut = BigInt(Math.floor(Number(wbnbIn) * perWbnb * 0.99))
  await tx(demo, { address: WBNB, abi: erc20 as Abi, functionName: 'approve', args: [ROUTER, wbnbIn] }, 'approve the router for exactly this swap')
  await tx(demo, { address: ROUTER, abi: parseAbi(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)']) as Abi,
    functionName: 'exactInputSingle', args: [{ tokenIn: WBNB, tokenOut: token, fee: 100, recipient: demo.address, deadline: days(0) + 600n, amountIn: wbnbIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] }, `swap ${wbnbIn} WBNB wei to ${token === USDC ? 'USDC' : 'USDT'} (min ${minOut})`)
}

async function swap() {
  await swapTo(USDC, c56.pools[2]!.address, parseEther('0.006'))
  await swapTo(USDT, POOL_USDT_100.address, parseEther('0.03'))
}

async function loan() {
  const comp = CHARTER_CHAINS[56].comptroller
  await tx(demo, { address: V_BNB, abi: parseAbi(['function mint() payable']) as Abi, functionName: 'mint', value: parseEther('0.012') }, 'supply 0.012 BNB to Venus')
  await tx(demo, { address: comp, abi: parseAbi(['function enterMarkets(address[]) returns (uint256[])']) as Abi, functionName: 'enterMarkets', args: [[V_BNB]] }, 'use it as collateral')
  const vUSDT = CHARTER_CHAINS[56].markets[0]!.vToken
  await tx(demo, { address: vUSDT, abi: parseAbi(['function borrow(uint256) returns (uint256)']) as Abi, functionName: 'borrow', args: [parseEther('2')] }, 'borrow 2 USDT')
  const [h] = await pub.readContract({ address: c56.loanFactory!, abi: loanGuardFactoryV2Abi, functionName: 'healthOf', args: [demo.address] }) as unknown as [bigint]
  const hf = Number(h) / 1e18
  // A canary that acts at its next check: trigger just above today's health, target above it.
  const trigger = parseEther((Math.floor(hf * 100) / 100 + 0.1).toFixed(2))
  const target = trigger + parseEther('0.3')
  const a = { p: { vDebt: vUSDT, trigger, target, budget: parseEther('1'), minRepay: parseEther('0.02') }, expiresAt: days(30), tipPerAction: 0n, tipBudget: 0n }
  const s = salt()
  const predicted = await pub.readContract({ address: c56.loanFactory!, abi: loanGuardFactoryV2Abi, functionName: 'predict', args: [demo.address, a, s] })
  await tx(demo, { address: USDT, abi: erc20 as Abi, functionName: 'approve', args: [predicted, a.p.budget] }, 'allow 1 USDT to the predicted guard')
  const t = await tx(demo, { address: c56.loanFactory!, abi: loanGuardFactoryV2Abi as Abi, functionName: 'create', args: [a, s] }, 'create the Loan Guard canary')
  save('loan', { address: predicted, tx: t, healthAtCreate: hf, trigger: String(trigger), target: String(target) })
}

async function yieldSweep() {
  const m = CHARTER_CHAINS[56].markets[1]! // vUSDC, not borrowed by the demo wallet
  const p = { vToken: m.vToken, floor: parseEther('1'), ceiling: parseEther('2'), minAction: parseEther('0.4'), supplyCap: parseEther('5'), minHealthAfter: 0n }
  const a = { p, expiresAt: days(30), tipPerAction: 0n, tipBudget: 0n }
  const s = salt()
  const predicted = await pub.readContract({ address: c56.yieldFactory!, abi: yieldSweepFactoryAbi, functionName: 'predict', args: [demo.address, a, s] })
  const vAllow = await pub.readContract({ address: c56.yieldFactory!, abi: yieldSweepFactoryAbi, functionName: 'vTokenAllowanceFor', args: [m.vToken, p.supplyCap] })
  await tx(demo, { address: m.token, abi: erc20 as Abi, functionName: 'approve', args: [predicted, p.supplyCap] }, 'allow 5 USDC to the predicted sweep')
  await tx(demo, { address: m.vToken, abi: erc20 as Abi, functionName: 'approve', args: [predicted, vAllow] }, 'allow it to bring back its own vUSDC')
  const t = await tx(demo, { address: c56.yieldFactory!, abi: yieldSweepFactoryAbi as Abi, functionName: 'create', args: [a, s] }, 'create the Yield Sweep canary')
  save('yield', { address: predicted, tx: t })
}

async function grid() {
  const pool = POOL_USDT_100
  const [, tick] = await pub.readContract({ address: pool.address, abi: poolAbi, functionName: 'slot0' })
  const b0 = pool.base.toLowerCase() < pool.quote.toLowerCase()
  const bt = b0 ? tick : -tick
  const step = Number(await pub.readContract({ address: c56.gridFactory!, abi: gridBandFactoryAbi, functionName: 'minStep', args: [pool.address, 30] }))
  // Buy-only, four levels just under the price: the first buy needs only a small dip, each sale one level up.
  const p = { pool: pool.address, base: pool.base, lowerBt: bt - 4 * step - 8, stepTicks: step, slots: 4, orderQuote: parseEther('4'), baseOrder: 0n,
    buyCap: parseEther('16'), sellCap: parseEther('0.04'), twapWindow: 120, maxDeviation: 20, slipTicks: 30, minFillBps: 5_000 }
  const fullFrom = await pub.readContract({ address: c56.gridFactory!, abi: gridBandFactoryAbi, functionName: 'fullFromNow', args: [p] })
  const a = { p, expiresAt: days(30), tipToken: pool.quote, tipPerAction: 0n, tipBudget: 0n, executors: [EXECUTORS.lattice, EXECUTORS.backup], fullFrom }
  const s = salt()
  const predicted = await pub.readContract({ address: c56.gridFactory!, abi: gridBandFactoryAbi, functionName: 'predict', args: [demo.address, a, s] })
  await tx(demo, { address: pool.quote, abi: erc20 as Abi, functionName: 'approve', args: [predicted, p.buyCap] }, 'allow 16 USDT for buys')
  await tx(demo, { address: pool.base, abi: erc20 as Abi, functionName: 'approve', args: [predicted, p.sellCap] }, 'allow 0.04 WBNB for sells')
  const t = await tx(demo, { address: c56.gridFactory!, abi: gridBandFactoryAbi as Abi, functionName: 'create', args: [a, s] }, 'create the Grid Band canary')
  save('grid', { address: predicted, tx: t, step, fullFrom })
}

async function range() {
  const pool = POOL_USDT_100
  const npm = c56.npm
  const [, tick] = await pub.readContract({ address: pool.address, abi: poolAbi, functionName: 'slot0' })
  const [t0, t1] = pool.base.toLowerCase() < pool.quote.toLowerCase() ? [pool.base, pool.quote] : [pool.quote, pool.base]
  const want0 = t0 === USDT ? parseEther('5') : parseEther('0.008')
  const want1 = t1 === USDT ? parseEther('5') : parseEther('0.008')
  await tx(demo, { address: t0, abi: erc20 as Abi, functionName: 'approve', args: [npm, want0] }, 'allow the position manager token0 for this mint')
  await tx(demo, { address: t1, abi: erc20 as Abi, functionName: 'approve', args: [npm, want1] }, 'allow the position manager token1 for this mint')
  const mintAbi = parseAbi(['function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) payable returns (uint256,uint128,uint256,uint256)', 'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'])
  const mintHash = await tx(demo, { address: npm, abi: mintAbi as Abi, functionName: 'mint', args: [[t0, t1, 100, tick - 250, tick + 250, want0, want1, 0n, 0n, demo.address, days(0) + 600n]] }, 'mint a 500-tick position')
  for (const t of [t0, t1]) await tx(demo, { address: t, abi: erc20 as Abi, functionName: 'approve', args: [npm, 0n] }, 'clear the leftover mint allowance')
  const r = await pub.getTransactionReceipt({ hash: mintHash })
  const id = BigInt(r.logs.find((l) => l.address.toLowerCase() === npm.toLowerCase() && l.topics.length === 4)!.topics[3]!)
  const created = (rangeKeeperFactoryAbi as readonly { type: string; name?: string; inputs?: readonly AbiParameter[] }[]).find((x) => x.type === 'event' && x.name === 'Created')!
  const create = {
    p: { pool: pool.address, mode: 0, feesToOwner: true, twapWindow: 300, maxDeviation: 20, slipTicks: 50, bufferTicks: 50, maxLossBps: 100, maxLeftoverBps: 500, minInterval: 3600, maxRebalances: 5 },
    expiresAt: days(30), tipToken: pool.quote, tipPerAction: 0n, tipBudget: 0n, executors: [EXECUTORS.bound, EXECUTORS.backup], userSalt: salt(),
  }
  const data = encodeAbiParameters([created.inputs!.find((i) => i.name === 'params')!], [create])
  const t = await tx(demo, { address: npm, abi: parseAbi(['function safeTransferFrom(address,address,uint256,bytes)']) as Abi, functionName: 'safeTransferFrom', args: [demo.address, c56.rangeFactory!, id, data] }, 'grant: the position to the Range Keeper factory')
  const tr = await pub.getTransactionReceipt({ hash: t })
  const moved = tr.logs.filter((l) => l.address.toLowerCase() === npm.toLowerCase() && l.topics.length === 4)
  save('range', { address: `0x${moved[moved.length - 1]!.topics[2]!.slice(26)}`, tx: t, tokenId: id.toString() })
}

async function status() {
  console.log('demo', demo.address, 'BNB', await pub.getBalance({ address: demo.address }), 'USDT', await bal(USDT, demo.address), 'USDC', await bal(USDC, demo.address), 'WBNB', await bal(WBNB, demo.address))
  console.log(JSON.stringify(rec(), null, 1))
}

const cmd = process.argv[2]
const run = { fund, swap, loan, yield: yieldSweep, grid, range, status }[cmd as 'fund']
if (!run) { console.error('usage: fund|swap|loan|yield|grid|range|status'); process.exit(2) }
if ((await pub.getChainId()) !== 56) throw new Error('mainnet only')
await run().catch((e) => { console.error('FAILED', (e as Error).message.slice(0, 500)); process.exit(1) })
