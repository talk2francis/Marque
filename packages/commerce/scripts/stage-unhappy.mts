/**
 * P2-04 TESTNET: stage the unhappy paths once, so Disputed, JobExpired and Refunded
 * exist as real logs (verify-topics) and the indexer's handling of them is proven.
 *   A. A job paying a fresh random address (it can never deliver): fund, wait past
 *      expiry, claimRefund.  B. A real Keel hire through the public API, disputed
 *      inside the review window after delivery.  Testnet 97 only, the P2-02 test wallet.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createWalletClient, http, erc20Abi, type Hex, type Address } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { chainClient } from '../src/chain.js'
import { NETWORKS } from '../src/config.js'
import { createJobCall, paymentCalls, claimRefundCall, disputeCall, type Call, type HireTerms } from '../src/calls.js'
import { agenticCommerceAbi } from '../src/generated.js'
import { decodeEventLog } from 'viem'

const BASE = 'https://marque.trade'
const pk = (JSON.parse(readFileSync('/root/.marque/test-wallets/p2-02-testnet.json', 'utf8')) as { privateKey: Hex }).privateKey
const account = privateKeyToAccount(pk)
const pub = chainClient(97)
const w = createWalletClient({ account, chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com') })
const net = NETWORKS[97]
const U = net.assets.find((a) => a.isDefault)!
const log = (...m: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...m)
const ev: Record<string, unknown> = { startedAt: new Date().toISOString() }

async function send(c: Call): Promise<Hex> {
  const h = await w.writeContract({ address: c.to, abi: c.abi, functionName: c.functionName, args: c.args as unknown[] } as never)
  const r = await pub.waitForTransactionReceipt({ hash: h })
  if (r.status !== 'success') throw new Error(`${c.step} reverted ${h}`)
  return h
}
async function jobIdFrom(tx: Hex): Promise<bigint> {
  const r = await pub.getTransactionReceipt({ hash: tx })
  for (const l of r.logs) { try { const d = decodeEventLog({ abi: agenticCommerceAbi, data: l.data, topics: l.topics }); if (d.eventName === 'JobCreated') return (d.args as { jobId: bigint }).jobId } catch { /* next */ } }
  throw new Error('no JobCreated')
}
async function post<T>(route: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}/api/v1/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json(); if (!r.ok) throw new Error(`${route}: ${JSON.stringify(j)}`); return j as T
}

// B first (it finishes inside the 15-minute window); A's expiry runs in parallel.
const keel = '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556'
const q = await post<{ quoteId: number; provider: Address; price: string; priceLabel: string; token: HireTerms['token']; agentName: string }>('hire/quote', { agentId: keel, task: 'Health factor of Venus account 0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf and the repay that restores it to 2.5.' })
const i = await post<{ intentId: string; expiredAt: string; description: string }>('hire/intent', { wallet: account.address, quoteId: q.quoteId })
const tB: HireTerms = { chainId: 97, provider: q.provider, token: q.token, price: BigInt(q.price), priceLabel: q.priceLabel, agentName: q.agentName, expiredAt: BigInt(i.expiredAt), description: i.description }
const createB = await send(createJobCall(tB)); const jobB = await jobIdFrom(createB)
await post('hire/bind', { intentId: i.intentId, txHash: createB })
for (const c of paymentCalls(tB, jobB, await pub.readContract({ address: U.address, abi: erc20Abi, functionName: 'allowance', args: [account.address, net.commerce] }))) await send(c)
await post('hire/notify', { chainId: 97, jobId: jobB.toString() })
log(`B: job ${jobB} funded, waiting for delivery`)

// A: a provider that does not exist as an agent, so nothing will ever be delivered.
const ghost = privateKeyToAccount(generatePrivateKey()).address
const now = Math.floor(Date.now() / 1000)
let jobA: bigint | null = null
let expA = 0
for (const secs of [960, 1800, 3700]) {
  const tA: HireTerms = { chainId: 97, provider: ghost, token: U, price: 10n ** 16n, priceLabel: '0.01 U', agentName: 'nobody', expiredAt: BigInt(now + secs), description: 'P2-04 unhappy-path staging: this job is meant to expire and be refunded.' }
  try {
    const createA = await send(createJobCall(tA)); jobA = await jobIdFrom(createA); expA = now + secs
    for (const c of paymentCalls(tA, jobA, await pub.readContract({ address: U.address, abi: erc20Abi, functionName: 'allowance', args: [account.address, net.commerce] }))) await send(c)
    log(`A: job ${jobA} to ${ghost} funded, expires in ${secs}s`); ev.expiry = { jobId: jobA.toString(), provider: ghost, createTx: createA, expiresAt: new Date(expA * 1000).toISOString() }
    break
  } catch (e) { log(`A: expiry +${secs}s refused (${(e as Error).message.slice(0, 80)}), trying longer`) }
}

for (let t = 0; t < 60; t++) {
  const job = await pub.readContract({ address: net.commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [jobB] }) as { status: number }
  if (job.status >= 2) break
  await new Promise((r) => setTimeout(r, 10_000))
}
const disputeTx = await send(disputeCall(97, jobB)).catch((e) => `failed: ${(e as Error).message.slice(0, 200)}`)
log(`B: dispute on job ${jobB} -> ${disputeTx}`); ev.dispute = { jobId: jobB.toString(), createTx: createB, disputeTx }

if (jobA !== null) {
  const wait = expA * 1000 - Date.now() + 20_000
  if (wait > 0) { log(`A: waiting ${Math.round(wait / 1000)}s for expiry`); await new Promise((r) => setTimeout(r, wait)) }
  const refundTx = await send(claimRefundCall(97, jobA)).catch((e) => `failed: ${(e as Error).message.slice(0, 200)}`)
  log(`A: claimRefund on job ${jobA} -> ${refundTx}`); (ev.expiry as Record<string, unknown>).refundTx = refundTx
}
ev.finishedAt = new Date().toISOString()
writeFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/phase2/evidence/testnet-unhappy-paths.json'), JSON.stringify(ev, null, 2) + '\n')
log('done')
