/**
 * The Forge kit's daily on-chain action (src/daily-action.ts in every starter), kept here as one source and embedded in
 * the kit with its category filled in. It runs on the builder's own host with the builder's own BSC testnet key from
 * their own environment; Marque never sees the key, relays nothing and pays for nothing. Chain 97 only.
 *
 * The source avoids backticks and template expressions so it can live in a raw string.
 */
export const DAILY_ACTION_SOURCE = String.raw`/**
 * One small category-consistent action a day on BSC testnet, from your agent's own wallet.
 *
 *   health_factor  supply a little test BNB to Venus (vBNB.mint)
 *   yield          supply test BNB to Venus on even days, move half of it out (redeemUnderlying) on odd days
 *   grid           one small swap of test BNB for test USDT on PancakeSwap v3 (WBNB/USDT 0.25%)
 *   rebalancing    keep one PancakeSwap v3 WBNB/USDT position centred on the current price: close the old one, open a new one
 *
 * What it spends: ACTION_TBNB per day (default 0.0005 test BNB, capped at 0.005) plus network fees in test BNB.
 * Test tokens have no value. It refuses to run on any chain but BSC testnet (97).
 * How to stop it: remove the cron line or systemd timer that runs "pnpm action:daily". Nothing else runs it.
 * Log: every action is appended to actions.log.jsonl in this folder.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther, maxUint128, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'

const CATEGORY = '__CATEGORY__' as 'health_factor' | 'yield' | 'grid' | 'rebalancing'
const LOG = 'actions.log.jsonl'
const T = {
  vBNB: '0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c',
  wbnb: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
  usdt: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
  swapRouter: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
  quoter: '0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2',
  positionManager: '0x427bF5b37357632377eCbEC9de3626C71A5396c1',
  pool: '0x270E1420eFc26e4945113730a4c3D5cfF58A73ea',
} as const
const FEE = 2500
const abi = {
  vToken: parseAbi(['function mint() payable', 'function redeemUnderlying(uint256) returns (uint256)', 'function balanceOfUnderlying(address) returns (uint256)']),
  router: parseAbi(['function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256)']),
  quoter: parseAbi(['function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256, uint160, uint32, uint256)']),
  pool: parseAbi(['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)', 'function tickSpacing() view returns (int24)', 'function token0() view returns (address)']),
  erc20: parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address, address) view returns (uint256)', 'function approve(address, uint256) returns (bool)']),
  npm: parseAbi([
    'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
    'function positions(uint256) view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)',
    'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) payable returns (uint256, uint256)',
    'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) payable returns (uint256, uint256)',
    'function burn(uint256) payable',
    'function refundETH() payable',
    'function multicall(bytes[]) payable returns (bytes[])',
  ]),
}

function fail(msg: string): never { console.error(msg); process.exit(1) }

const key = process.env.ACTION_PRIVATE_KEY
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) fail('Set ACTION_PRIVATE_KEY to your agent wallet\'s BSC testnet key (0x and 64 hex characters), in your own environment.')
const spend = parseEther(process.env.ACTION_TBNB || '0.0005')
if (spend <= 0n || spend > parseEther('0.005')) fail('ACTION_TBNB must be above 0 and at most 0.005 test BNB.')
const rpc = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com'
const account = privateKeyToAccount(key as Hex)
const pub = createPublicClient({ chain: bscTestnet, transport: http(rpc) })
const wallet = createWalletClient({ account, chain: bscTestnet, transport: http(rpc) })
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600)
const today = new Date().toISOString().slice(0, 10)

function lastEntries(): Array<Record<string, unknown>> {
  if (!existsSync(LOG)) return []
  return readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) as Record<string, unknown> } catch { return {} } })
}
async function send(label: string, tx: Promise<Hex>): Promise<Hex> {
  const hash = await tx
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') fail(label + ' reverted: ' + hash)
  console.log(label + ': https://testnet.bscscan.com/tx/' + hash)
  return hash
}

async function main() {
  if ((await pub.getChainId()) !== 97) fail('The RPC is not BSC testnet (chain 97). This script never runs anywhere else.')
  const done = lastEntries().some((e) => e.day === today && e.category === CATEGORY)
  if (done && !process.argv.includes('--force')) { console.log('Already acted today (' + today + '). Nothing sent.'); return }
  const balance = await pub.getBalance({ address: account.address })
  if (balance < spend * 3n) fail('The wallet holds ' + formatEther(balance) + ' test BNB; it needs at least ' + formatEther(spend * 3n) + '. Get test BNB from BNB Chain\'s faucet.')
  const txs: Hex[] = []
  let what = ''
  const day = Math.floor(Date.now() / 86_400_000)

  if (CATEGORY === 'health_factor' || (CATEGORY === 'yield' && day % 2 === 0)) {
    what = 'supply ' + formatEther(spend) + ' test BNB to Venus'
    txs.push(await send('Venus supply', wallet.writeContract({ address: T.vBNB, abi: abi.vToken, functionName: 'mint', value: spend })))
  } else if (CATEGORY === 'yield') {
    const { result: supplied } = await pub.simulateContract({ address: T.vBNB, abi: abi.vToken, functionName: 'balanceOfUnderlying', args: [account.address], account })
    if (supplied < spend) {
      what = 'supply ' + formatEther(spend) + ' test BNB to Venus (nothing supplied yet to move)'
      txs.push(await send('Venus supply', wallet.writeContract({ address: T.vBNB, abi: abi.vToken, functionName: 'mint', value: spend })))
    } else {
      const amount = supplied / 2n
      what = 'move ' + formatEther(amount) + ' test BNB out of Venus'
      txs.push(await send('Venus redeem', wallet.writeContract({ address: T.vBNB, abi: abi.vToken, functionName: 'redeemUnderlying', args: [amount] })))
    }
  } else if (CATEGORY === 'grid') {
    const { result: q } = await pub.simulateContract({ address: T.quoter, abi: abi.quoter, functionName: 'quoteExactInputSingle', args: [{ tokenIn: T.wbnb, tokenOut: T.usdt, amountIn: spend, fee: FEE, sqrtPriceLimitX96: 0n }] })
    const min = (q[0] * 98n) / 100n
    what = 'swap ' + formatEther(spend) + ' test BNB for at least ' + formatEther(min) + ' test USDT'
    txs.push(await send('PancakeSwap swap', wallet.writeContract({ address: T.swapRouter, abi: abi.router, functionName: 'exactInputSingle', value: spend,
      args: [{ tokenIn: T.wbnb, tokenOut: T.usdt, fee: FEE, recipient: account.address, deadline: deadline(), amountIn: spend, amountOutMinimum: min, sqrtPriceLimitX96: 0n }] })))
  } else {
    // Rebalancing: close the last position this script opened, then open one centred on the current tick.
    const last = [...lastEntries()].reverse().find((e) => e.category === 'rebalancing' && typeof e.tokenId === 'string')
    const calls: Hex[] = []
    const { encodeFunctionData } = await import('viem')
    if (last) {
      const id = BigInt(last.tokenId as string)
      const pos = await pub.readContract({ address: T.positionManager, abi: abi.npm, functionName: 'positions', args: [id] })
      if (pos[7] > 0n) calls.push(encodeFunctionData({ abi: abi.npm, functionName: 'decreaseLiquidity', args: [{ tokenId: id, liquidity: pos[7], amount0Min: 0n, amount1Min: 0n, deadline: deadline() }] }))
      calls.push(encodeFunctionData({ abi: abi.npm, functionName: 'collect', args: [{ tokenId: id, recipient: account.address, amount0Max: maxUint128, amount1Max: maxUint128 }] }))
      calls.push(encodeFunctionData({ abi: abi.npm, functionName: 'burn', args: [id] }))
      txs.push(await send('Close the old position', wallet.writeContract({ address: T.positionManager, abi: abi.npm, functionName: 'multicall', args: [calls] })))
    }
    // Half the spend becomes test USDT; the other half goes in as test BNB.
    const half = spend / 2n
    const { result: q } = await pub.simulateContract({ address: T.quoter, abi: abi.quoter, functionName: 'quoteExactInputSingle', args: [{ tokenIn: T.wbnb, tokenOut: T.usdt, amountIn: half, fee: FEE, sqrtPriceLimitX96: 0n }] })
    txs.push(await send('Swap half to test USDT', wallet.writeContract({ address: T.swapRouter, abi: abi.router, functionName: 'exactInputSingle', value: half,
      args: [{ tokenIn: T.wbnb, tokenOut: T.usdt, fee: FEE, recipient: account.address, deadline: deadline(), amountIn: half, amountOutMinimum: (q[0] * 98n) / 100n, sqrtPriceLimitX96: 0n }] })))
    const usdt = await pub.readContract({ address: T.usdt, abi: abi.erc20, functionName: 'balanceOf', args: [account.address] })
    const allowance = await pub.readContract({ address: T.usdt, abi: abi.erc20, functionName: 'allowance', args: [account.address, T.positionManager] })
    // An exact approval for this position only (listed in the log; approvals never count as actions).
    if (allowance < usdt) txs.push(await send('Approve exactly this test USDT', wallet.writeContract({ address: T.usdt, abi: abi.erc20, functionName: 'approve', args: [T.positionManager, usdt] })))
    const [slot0, spacing, token0] = await Promise.all([
      pub.readContract({ address: T.pool, abi: abi.pool, functionName: 'slot0' }),
      pub.readContract({ address: T.pool, abi: abi.pool, functionName: 'tickSpacing' }),
      pub.readContract({ address: T.pool, abi: abi.pool, functionName: 'token0' }),
    ])
    const centre = Math.floor(slot0[1] / spacing) * spacing
    const lower = centre - 10 * spacing
    const upper = centre + 10 * spacing
    const wbnbIs0 = token0.toLowerCase() === T.wbnb.toLowerCase()
    const mintArgs = { token0: wbnbIs0 ? T.wbnb : T.usdt, token1: wbnbIs0 ? T.usdt : T.wbnb, fee: FEE, tickLower: lower, tickUpper: upper,
      amount0Desired: wbnbIs0 ? half : usdt, amount1Desired: wbnbIs0 ? usdt : half, amount0Min: 0n, amount1Min: 0n, recipient: account.address, deadline: deadline() }
    const mint = encodeFunctionData({ abi: abi.npm, functionName: 'mint', args: [mintArgs] })
    const refund = encodeFunctionData({ abi: abi.npm, functionName: 'refundETH' })
    const { result } = await pub.simulateContract({ address: T.positionManager, abi: abi.npm, functionName: 'multicall', args: [[mint, refund]], value: half, account })
    const { decodeFunctionResult } = await import('viem')
    const minted = decodeFunctionResult({ abi: abi.npm, functionName: 'mint', data: result[0]! })
    txs.push(await send('Open a centred position', wallet.writeContract({ address: T.positionManager, abi: abi.npm, functionName: 'multicall', args: [[mint, refund]], value: half })))
    what = 'centre a WBNB/USDT position on tick ' + centre + ' (' + lower + ' to ' + upper + ')'
    appendFileSync(LOG, JSON.stringify({ day: today, at: new Date().toISOString(), category: CATEGORY, wallet: account.address, what, txs, tokenId: minted[0].toString() }) + '\n')
    console.log(what)
    return
  }
  appendFileSync(LOG, JSON.stringify({ day: today, at: new Date().toISOString(), category: CATEGORY, wallet: account.address, what, txs }) + '\n')
  console.log(what)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
`

export function dailyActionFor(category: string): string {
  return DAILY_ACTION_SOURCE.replace("'__CATEGORY__'", `'${category}'`)
}
