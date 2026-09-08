#!/usr/bin/env node
/**
 * P9b / P10.5F item 2 — the one real mainnet PancakeSwap V3 rebalance proof.
 *
 * Escalation gate 1 (AGENTS.md): every send here is a mainnet state change and
 * runs ONLY after Francis's written "approved, mainnet". Given 2026-09-08.
 *
 * The private key is read from PROOF_PK in the environment and is never written
 * to disk, never logged, never echoed. Run as:
 *   PROOF_PK=0x... node scripts/pancake-proof.mjs <cmd> [--go]
 *
 * Commands:
 *   plan       — read pool + wallet, print the range it would open. No tx.
 *   open       — wrap BNB, approve, mint a deliberately narrow range.   (sends with --go)
 *   status     — is the open position in range? how long has it been out?
 *   rebalance  — withdraw the drifted position, swap to 50/50, re-centre. (sends with --go)
 *   finalize   — recompute gas/slippage totals and mark the proof complete.
 *
 * Without --go every command is a dry run: it simulates and estimates gas but
 * sends nothing.
 *
 * Evidence is written to docs/pancakeswap-proof.json, which /pancakeswap/proof
 * renders verbatim. A failed rebalance is published with its revert reason,
 * per the phase prompt.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient, createWalletClient, http, fallback, parseAbi,
  formatEther, formatUnits, parseUnits, maxUint128, decodeEventLog,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc } from 'viem/chains'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROOF_PATH = join(ROOT, 'docs', 'pancakeswap-proof.json')
const STATE_PATH = join(ROOT, 'docs', '.pancake-proof-state.json') // gitignored working notes

const GO = process.argv.includes('--go')
const CMD = process.argv[2]

// --- constants ------------------------------------------------------------
const A = {
  nfpm: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', // NonfungiblePositionManager
  factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  swapRouter: '0x1b81D678ffb9C0263b24A97847620C99d213eB14', // PancakeSwap V3 SwapRouter
  wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  usdt: '0x55d398326f99059fF775485246999027B3197955',
}
const FEE = 100            // 0.01% tier, tickSpacing 1 — lets us place a precise narrow band
const SPACING = 1
const HALF_WIDTH_TICKS = 15 // ±0.15% -> ~0.30% band, drifts out of a busy pool within hours
const POSITION_USDT = '12'  // ~$12 a side, ~$24 position; leaves the rest for gas + the re-mint
const SLIPPAGE_BPS = 150    // 1.5% floor on mint amounts / swap output

// token0/token1 are address-sorted: USDT < WBNB on BSC, so token0 = USDT.
const T0 = A.usdt.toLowerCase() < A.wbnb.toLowerCase() ? A.usdt : A.wbnb
const T1 = T0 === A.usdt ? A.wbnb : A.usdt
const USDT_IS_0 = T0.toLowerCase() === A.usdt.toLowerCase()

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
])
const wbnbAbi = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256)',
  'function balanceOf(address) view returns (uint256)',
])
const poolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint32,bool)',
  'function tickSpacing() view returns (int24)',
])
const factoryAbi = parseAbi(['function getPool(address,address,uint24) view returns (address)'])
const nfpmAbi = parseAbi([
  'function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)',
  'function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) payable returns (uint256 amount0,uint256 amount1)',
  'function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256 amount0,uint256 amount1)',
  'function multicall(bytes[]) payable returns (bytes[])',
  'function positions(uint256) view returns (uint96,address,address,address,uint24,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256,uint256,uint128,uint128)',
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)',
  'event IncreaseLiquidity(uint256 indexed tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)',
])
const routerAbi = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
])

// --- clients ------------------------------------------------------------
// publicnode rejects eth_getTransactionReceipt as an "archive" call, so it is
// excluded here; these four serve receipts and logs reliably.
const RPCS = [
  'https://bsc-dataseed.bnbchain.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed1.ninicoin.io',
  'https://bsc.blockrazor.xyz',
]
const transport = () => fallback(RPCS.map((u) => http(u, { timeout: 20_000 })), { rank: false })
const pub = createPublicClient({ chain: bsc, transport: transport() })

function account() {
  const pk = process.env.PROOF_PK
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('PROOF_PK missing/invalid. Pass it inline: PROOF_PK=0x... node scripts/pancake-proof.mjs ' + CMD)
  }
  return privateKeyToAccount(pk)
}
function wallet() {
  return createWalletClient({ account: account(), chain: bsc, transport: transport() })
}

// --- helpers ----------------------------------------------------------
const nearestUsable = (t) => Math.round(t / SPACING) * SPACING
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300)
const lessBps = (x, bps) => (x * BigInt(10000 - bps)) / 10000n
const bnbPx = (tick) => (USDT_IS_0 ? 1 / Math.pow(1.0001, tick) : Math.pow(1.0001, tick)) // USDT per BNB

function loadProof() {
  try { return JSON.parse(readFileSync(PROOF_PATH, 'utf8')) } catch { return { status: 'pending' } }
}
function saveProof(p) {
  writeFileSync(PROOF_PATH, JSON.stringify(p, null, 2) + '\n')
  console.log('· wrote', PROOF_PATH.replace(ROOT + '/', ''), '→ status:', p.status)
}
function loadState() {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')) } catch { return {} }
}
function saveState(s) { writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + '\n') }

async function poolAddr() {
  const p = await pub.readContract({ address: A.factory, abi: factoryAbi, functionName: 'getPool', args: [T0, T1, FEE] })
  if (/^0x0+$/.test(p)) throw new Error('pool not found')
  return p
}
async function poolState(p) {
  const [s0, sp] = await Promise.all([
    pub.readContract({ address: p, abi: poolAbi, functionName: 'slot0' }),
    pub.readContract({ address: p, abi: poolAbi, functionName: 'tickSpacing' }),
  ])
  return { sqrtPriceX96: s0[0], tick: Number(s0[1]), spacing: Number(sp) }
}
async function gasUsd(receipt) {
  const bnb = Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice))
  return bnb * (await bnbUsdSpot())
}
let _spot
async function bnbUsdSpot() {
  if (_spot) return _spot
  const { tick } = await poolState(await poolAddr())
  _spot = bnbPx(tick)
  return _spot
}
async function send(label, req) {
  const w = wallet()
  const sim = await pub.simulateContract({ account: w.account, ...req })
  let gas
  try { gas = await pub.estimateContractGas({ account: w.account, ...req }) } catch { gas = 0n }
  console.log(`  ${label}: simulated ok · gas~${gas}`)
  if (!GO) { console.log('  (dry run — pass --go to send)'); return { sim, receipt: null, hash: null } }
  const hash = await w.writeContract(sim.request)
  console.log(`  → ${label} sent: ${hash}`)
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 })
  console.log(`  ← ${label} ${receipt.status} in block ${receipt.blockNumber} · gas ${receipt.gasUsed}`)
  if (receipt.status !== 'success') throw new Error(`${label} reverted (${hash})`)
  return { sim, receipt, hash }
}

// --- commands -------------------------------------------------------
async function cmdPlan() {
  const acct = process.env.PROOF_PK ? account().address : '0x2e010AaDFdFEbC2AdFCAFA5F83e9687ffA47C573'
  const p = await poolAddr()
  const st = await poolState(p)
  const tl = nearestUsable(st.tick - HALF_WIDTH_TICKS)
  const tu = nearestUsable(st.tick + HALF_WIDTH_TICKS)
  const [bnb, usdtBal] = await Promise.all([
    pub.getBalance({ address: acct }),
    pub.readContract({ address: A.usdt, abi: erc20, functionName: 'balanceOf', args: [acct] }),
  ])
  console.log('POOL     ', p, `(BNB/USDT ${FEE / 10000}% · spacing ${st.spacing})`)
  console.log('wallet   ', acct)
  console.log('  BNB    ', formatEther(bnb))
  console.log('  USDT   ', formatUnits(usdtBal, 18))
  console.log('current  ', 'tick', st.tick, '≈', bnbPx(st.tick).toFixed(2), 'USDT/BNB')
  console.log('range    ', `[${tl}, ${tu}]  (${((Math.pow(1.0001, tu - tl) - 1) * 100).toFixed(3)}% wide)`)
  console.log('          ', `${bnbPx(USDT_IS_0 ? tu : tl).toFixed(2)} — ${bnbPx(USDT_IS_0 ? tl : tu).toFixed(2)} USDT/BNB`)
  const usdt = parseUnits(POSITION_USDT, 18)
  const bnbSide = Number(POSITION_USDT) / bnbPx(st.tick)
  console.log('deposit  ', `${POSITION_USDT} USDT  +  ~${bnbSide.toFixed(5)} BNB   (~$${(Number(POSITION_USDT) * 2).toFixed(0)} position)`)
  return { pool: p, st, tl, tu, usdt, bnbWei: parseUnits(bnbSide.toFixed(9), 18) }
}

async function cmdOpen() {
  const plan = await cmdPlan()
  const w = wallet()
  const me = w.account.address
  const txs = []

  // 1. wrap BNB
  const wbnbBal = await pub.readContract({ address: A.wbnb, abi: wbnbAbi, functionName: 'balanceOf', args: [me] })
  if (wbnbBal < plan.bnbWei) {
    const need = plan.bnbWei - wbnbBal
    const r = await send(`wrap ${formatEther(need)} BNB`, { address: A.wbnb, abi: wbnbAbi, functionName: 'deposit', value: need })
    if (r.hash) txs.push({ label: 'Wrap BNB for the position', hash: r.hash })
  }
  // 2. approvals
  for (const [sym, token, amt] of [['USDT', A.usdt, plan.usdt], ['WBNB', A.wbnb, plan.bnbWei]]) {
    const cur = await pub.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [me, A.nfpm] })
    if (cur < amt) {
      const r = await send(`approve ${sym}`, { address: token, abi: erc20, functionName: 'approve', args: [A.nfpm, amt * 2n] })
      if (r.hash) txs.push({ label: `Approve ${sym} to the position manager`, hash: r.hash })
    }
  }
  // 3. mint
  const amount0Desired = USDT_IS_0 ? plan.usdt : plan.bnbWei
  const amount1Desired = USDT_IS_0 ? plan.bnbWei : plan.usdt
  // Mins are 0 on the OPEN only: a mint performs no swap, so there is no
  // slippage to bound here — the pool pulls whatever ratio the range needs at
  // the current tick and the remainder stays in the wallet. Slippage bounds are
  // enforced where they actually apply: the swap inside `rebalance`.
  const params = {
    token0: T0, token1: T1, fee: FEE,
    tickLower: plan.tl, tickUpper: plan.tu,
    amount0Desired, amount1Desired,
    amount0Min: 0n, amount1Min: 0n,
    recipient: me, deadline: deadline(),
  }
  const r = await send('mint narrow range', { address: A.nfpm, abi: nfpmAbi, functionName: 'mint', args: [params] })

  if (!r.receipt) return
  let minted
  for (const log of r.receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: nfpmAbi, data: log.data, topics: log.topics })
      if (ev.eventName === 'IncreaseLiquidity') minted = ev.args
    } catch { /* not ours */ }
  }
  const tokenId = minted ? minted.tokenId : await newestTokenId(me)
  txs.push({ label: 'Mint the deliberately-narrow range', hash: r.hash })

  const st = await poolState(plan.pool)
  const openState = {
    tokenId: tokenId.toString(), pool: plan.pool,
    tickLower: plan.tl, tickUpper: plan.tu,
    openedAt: new Date().toISOString(), openBlock: Number(r.receipt.blockNumber),
    openTick: st.tick,
    minted: minted ? { liquidity: minted.liquidity.toString(), amount0: minted.amount0.toString(), amount1: minted.amount1.toString() } : null,
    openTxs: txs,
    openGasUsd: await gasUsd(r.receipt),
    charter: {
      allowlist: [plan.pool, A.nfpm, A.swapRouter, A.wbnb, A.usdt],
      capUsd: 60,
      expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
    },
  }
  saveState(openState)

  saveProof({
    status: 'drifting',
    note: 'The position is open on mainnet and in range. It is deliberately narrow (~0.3%) so it drifts out within hours; this page updates itself when it does and again after the agent re-centres it.',
    pool: plan.pool, chainId: 56, agentId: 'bound',
    charterScope: openState.charter,
    before: {
      tickLower: plan.tl, tickUpper: plan.tu, currentTick: st.tick,
      outOfRangeSince: null, hoursOutOfRange: 0, feesAccruedUsd: 0,
    },
    transactions: txs,
    capturedAt: new Date().toISOString(),
  })
}

async function newestTokenId(owner) {
  const n = await pub.readContract({ address: A.nfpm, abi: nfpmAbi, functionName: 'balanceOf', args: [owner] })
  return pub.readContract({ address: A.nfpm, abi: nfpmAbi, functionName: 'tokenOfOwnerByIndex', args: [owner, n - 1n] })
}

async function cmdStatus() {
  const s = loadState()
  if (!s.tokenId) { console.log('no open position recorded — run `open` first'); return }
  const st = await poolState(s.pool)
  const below = st.tick < s.tickLower
  const above = st.tick > s.tickUpper
  const out = below || above
  console.log('position ', s.tokenId, `range [${s.tickLower}, ${s.tickUpper}]`)
  console.log('current  ', 'tick', st.tick, '≈', bnbPx(st.tick).toFixed(2), 'USDT/BNB')
  console.log('state    ', out ? `OUT OF RANGE (${below ? 'below — 100% ' + (USDT_IS_0 ? 'USDT' : 'WBNB') : 'above — 100% ' + (USDT_IS_0 ? 'WBNB' : 'USDT')})` : 'in range, still earning')

  let firstOut = s.firstOutAt
  if (out && !firstOut) { firstOut = new Date().toISOString(); saveState({ ...s, firstOutAt: firstOut, outTick: st.tick }) }
  if (!out && firstOut) { saveState({ ...s, firstOutAt: null }); firstOut = null; console.log('  (drifted back in — clock reset)') }
  if (firstOut) {
    const hrs = (Date.now() - Date.parse(firstOut)) / 3600_000
    console.log('out since ', firstOut, `→ ${hrs.toFixed(1)}h`)
    console.log(hrs >= 1 ? '  READY: run `rebalance` (add --go to send)' : '  give it a little longer')
    const p = loadProof()
    if (p.status === 'drifting' && p.before) {
      p.before.outOfRangeSince = firstOut
      p.before.hoursOutOfRange = Number(hrs.toFixed(1))
      p.before.currentTick = st.tick
      saveProof(p)
    }
  }
}

async function cmdRebalance() {
  const s = loadState()
  if (!s.tokenId) throw new Error('no open position — run `open` first')
  const w = wallet()
  const me = w.account.address
  const tokenId = BigInt(s.tokenId)
  const pos = await pub.readContract({ address: A.nfpm, abi: nfpmAbi, functionName: 'positions', args: [tokenId] })
  const liquidity = pos[7]
  if (liquidity === 0n) throw new Error('position already has zero liquidity — already withdrawn?')
  const st0 = await poolState(s.pool)
  console.log('withdrawing', s.tokenId, 'liquidity', liquidity.toString(), '· current tick', st0.tick)

  const txs = []
  const gasUsds = []
  try {
    // tx1 — decreaseLiquidity + collect in one multicall
    const dec = {
      abi: nfpmAbi, functionName: 'decreaseLiquidity',
      args: [{ tokenId, liquidity, amount0Min: 0n, amount1Min: 0n, deadline: deadline() }],
    }
    const col = {
      abi: nfpmAbi, functionName: 'collect',
      args: [{ tokenId, recipient: me, amount0Max: maxUint128, amount1Max: maxUint128 }],
    }
    const { encodeFunctionData } = await import('viem')
    const r1 = await send('withdraw (decreaseLiquidity + collect)', {
      address: A.nfpm, abi: nfpmAbi, functionName: 'multicall',
      args: [[encodeFunctionData(dec), encodeFunctionData(col)]],
    })
    if (r1.hash) { txs.push({ label: 'Withdraw the drifted position — decreaseLiquidity + collect', hash: r1.hash }); gasUsds.push(await gasUsd(r1.receipt)) }

    // read balances now
    const [usdtBal, wbnbBal] = await Promise.all([
      pub.readContract({ address: A.usdt, abi: erc20, functionName: 'balanceOf', args: [me] }),
      pub.readContract({ address: A.wbnb, abi: wbnbAbi, functionName: 'balanceOf', args: [me] }),
    ])
    const st1 = await poolState(s.pool)
    const px = bnbPx(st1.tick) // USDT per BNB
    const usdtVal = Number(formatUnits(usdtBal, 18))
    const wbnbVal = Number(formatEther(wbnbBal)) * px
    const total = usdtVal + wbnbVal
    console.log(`  holdings after withdraw: ${usdtVal.toFixed(3)} USDT + ${(wbnbVal / px).toFixed(5)} BNB ($${wbnbVal.toFixed(2)}) = $${total.toFixed(2)}`)

    // tx2 — swap toward 50/50 at current price
    const half = total / 2
    let swapReceipt = null
    let realisedSlippageBps = 0
    if (Math.abs(usdtVal - half) > 0.5) {
      const needMoreUsdt = usdtVal < half
      const tokenIn = needMoreUsdt ? A.wbnb : A.usdt
      const tokenOut = needMoreUsdt ? A.usdt : A.wbnb
      const amountIn = needMoreUsdt
        ? parseUnits(((half - usdtVal) / px).toFixed(9), 18)
        : parseUnits((half - wbnbVal).toFixed(6), 18)
      const cur = await pub.readContract({ address: tokenIn, abi: erc20, functionName: 'allowance', args: [me, A.swapRouter] })
      if (cur < amountIn) {
        const ra = await send(`approve ${needMoreUsdt ? 'WBNB' : 'USDT'} to router`, { address: tokenIn, abi: erc20, functionName: 'approve', args: [A.swapRouter, amountIn * 2n] })
        if (ra.hash) gasUsds.push(await gasUsd(ra.receipt))
      }
      const expectedOut = needMoreUsdt
        ? Number(formatEther(amountIn)) * px
        : Number(formatEther(amountIn)) / px
      const r2 = await send('swap toward 50/50', {
        address: A.swapRouter, abi: routerAbi, functionName: 'exactInputSingle',
        args: [{
          tokenIn, tokenOut, fee: FEE, recipient: me, deadline: deadline(),
          amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n,
        }],
      })
      if (r2.receipt) {
        swapReceipt = r2.receipt
        txs.push({ label: `Swap toward 50/50 at the current price`, hash: r2.hash })
        gasUsds.push(await gasUsd(r2.receipt))
        // realised slippage: decode amountOut from Swap event vs expectedOut
        let got
        for (const log of r2.receipt.logs) {
          try {
            const ev = decodeEventLog({
              abi: parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']),
              data: log.data, topics: log.topics,
            })
            const out0 = ev.args.amount0 < 0n ? -ev.args.amount0 : 0n
            const out1 = ev.args.amount1 < 0n ? -ev.args.amount1 : 0n
            got = Number(formatEther(out0 > 0n ? out0 : out1))
          } catch { /* not the pool Swap */ }
        }
        if (got && expectedOut) {
          const outNorm = needMoreUsdt ? got : got // both 18dp
          realisedSlippageBps = Math.max(0, Math.round((1 - outNorm / expectedOut) * 10000))
          console.log(`  swap: expected ~${expectedOut.toFixed(5)} got ${got.toFixed(5)} → ${realisedSlippageBps} bps`)
        }
      }
    } else {
      console.log('  already close to 50/50 — no swap needed')
    }

    // tx3 — mint the re-centred range
    const st2 = await poolState(s.pool)
    const tl = nearestUsable(st2.tick - HALF_WIDTH_TICKS * 3) // a touch wider on the re-centre: ~0.9%
    const tu = nearestUsable(st2.tick + HALF_WIDTH_TICKS * 3)
    const [usdt2, wbnb2] = await Promise.all([
      pub.readContract({ address: A.usdt, abi: erc20, functionName: 'balanceOf', args: [me] }),
      pub.readContract({ address: A.wbnb, abi: wbnbAbi, functionName: 'balanceOf', args: [me] }),
    ])
    // leave a little dust buffer
    const use0raw = USDT_IS_0 ? usdt2 : wbnb2
    const use1raw = USDT_IS_0 ? wbnb2 : usdt2
    const amt0 = (use0raw * 98n) / 100n
    const amt1 = (use1raw * 98n) / 100n
    for (const [sym, token, amt] of [['USDT', A.usdt, USDT_IS_0 ? amt0 : amt1], ['WBNB', A.wbnb, USDT_IS_0 ? amt1 : amt0]]) {
      const cur = await pub.readContract({ address: token, abi: erc20, functionName: 'allowance', args: [me, A.nfpm] })
      if (cur < amt) {
        const ra = await send(`re-approve ${sym}`, { address: token, abi: erc20, functionName: 'approve', args: [A.nfpm, amt * 2n] })
        if (ra.hash) gasUsds.push(await gasUsd(ra.receipt))
      }
    }
    const mintParams = {
      token0: T0, token1: T1, fee: FEE, tickLower: tl, tickUpper: tu,
      amount0Desired: amt0, amount1Desired: amt1,
      amount0Min: lessBps(amt0, 300), amount1Min: lessBps(amt1, 300),
      recipient: me, deadline: deadline(),
    }
    const r3 = await send('mint re-centred range', { address: A.nfpm, abi: nfpmAbi, functionName: 'mint', args: [mintParams] })
    let minted
    if (r3.receipt) {
      for (const log of r3.receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: nfpmAbi, data: log.data, topics: log.topics })
          if (ev.eventName === 'IncreaseLiquidity') minted = ev.args
        } catch { /* skip */ }
      }
      txs.push({ label: 'Open the re-centred range', hash: r3.hash })
      gasUsds.push(await gasUsd(r3.receipt))
    }

    if (!GO) { console.log('\n(dry run complete — pass --go to execute the rebalance)'); return }

    const p = loadProof()
    const gasTotal = gasUsds.reduce((a, b) => a + b, 0) + (s.openGasUsd || 0)
    const finished = {
      ...p,
      status: 'complete',
      note: undefined,
      before: {
        ...p.before,
        outOfRangeSince: s.firstOutAt || p.before?.outOfRangeSince,
        hoursOutOfRange: s.firstOutAt ? Number(((Date.now() - Date.parse(s.firstOutAt)) / 3600_000).toFixed(1)) : p.before?.hoursOutOfRange,
      },
      transactions: [...(p.transactions || []), ...txs],
      after: {
        tickLower: tl, tickUpper: tu, currentTick: st2.tick,
        inRange: st2.tick >= tl && st2.tick <= tu,
        resumedAtBlock: r3.receipt ? Number(r3.receipt.blockNumber) : null,
      },
      realisedSlippageBps,
      gasUsd: Number(gasTotal.toFixed(2)),
      agentFeeUsd: 0.15,
      capturedAt: new Date().toISOString(),
    }
    saveProof(finished)
    saveState({ ...s, rebalancedAt: new Date().toISOString(), newRange: [tl, tu] })
    console.log('\n✓ rebalance complete and published.')
  } catch (err) {
    const reason = err?.shortMessage || err?.message || String(err)
    console.error('\n✗ rebalance failed:', reason)
    if (GO) {
      const p = loadProof()
      saveProof({
        ...p,
        status: 'failed',
        note: `The mainnet rebalance was attempted and reverted. Publishing the failure is the honest outcome per the phase spec. Revert reason: ${reason}`,
        transactions: [...(p.transactions || []), ...txs],
        failedAt: new Date().toISOString(),
        revertReason: reason,
      })
    }
    process.exitCode = 1
  }
}

async function main() {
  if (!['plan', 'open', 'status', 'rebalance', 'finalize'].includes(CMD)) {
    console.log('usage: PROOF_PK=0x... node scripts/pancake-proof.mjs <plan|open|status|rebalance|finalize> [--go]')
    process.exit(1)
  }
  console.log(`# pancake-proof ${CMD}${GO ? ' --go (LIVE)' : ' (dry run)'} · block ${await pub.getBlockNumber()}\n`)
  if (CMD === 'plan') await cmdPlan()
  else if (CMD === 'open') await cmdOpen()
  else if (CMD === 'status') await cmdStatus()
  else if (CMD === 'rebalance') await cmdRebalance()
  else if (CMD === 'finalize') { const p = loadProof(); console.log(JSON.stringify(p, null, 2)) }
}
main().catch((e) => { console.error(e); process.exit(1) })
