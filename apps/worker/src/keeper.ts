/**
 * The keeper (P2-05, SPEC-COMMERCE 9). Every 5 min: for each Marque-bound job still in
 * SUBMITTED whose review window has elapsed on chain, call EvaluatorRouter.settle(jobId),
 * which releases the escrow to the agent. Settle is permissionless and moves no keeper
 * funds but gas.
 *
 * Gas: MegaFuel sponsors settle from this wallet (pm_isSponsorable, measured in P2-05).
 * A sponsorable settle is sent through MegaFuel at gas price 0; otherwise the keeper pays
 * from its own balance, and only while that balance is above KEEPER_MIN_BNB.
 * Caps: KEEPER_MAX_PER_HOUR (default 50). Status: /root/.marque/keeper/status.json.
 */
import { writeFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { createPublicClient, createWalletClient, encodeFunctionData, fallback, formatEther, http, parseEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { db, closeDb } from '@marque/db'
import { NETWORKS, agenticCommerceAbi, evaluatorRouterAbi, loadKeystore, type ChainId } from '@marque/commerce'

const DIR = process.env.KEEPER_DIR ?? '/root/.marque/keeper'
const CHAINS = (process.env.KEEPER_CHAINS ?? '56').split(',').map(Number) as ChainId[]
const TICK_MS = Number(process.env.KEEPER_TICK_MS ?? 300_000)
const MAX_PER_HOUR = Number(process.env.KEEPER_MAX_PER_HOUR ?? 50)
const MIN_BNB = parseEther(process.env.KEEPER_MIN_BNB ?? '0.0003')
const ONCE = process.argv.includes('--once')
const DRY = process.argv.includes('--dry-run')
const MEGAFUEL: Record<ChainId, string> = { 56: 'https://bsc-megafuel.nodereal.io/', 97: 'https://bsc-megafuel-testnet.nodereal.io/' }
const RPC: Record<ChainId, string[]> = {
  56: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.defibit.io', 'https://bsc-rpc.publicnode.com'],
  97: ['https://bsc-testnet-rpc.publicnode.com', 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'],
}

const account = privateKeyToAccount(loadKeystore(DIR))
const sent: number[] = []
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'keeper', event, ...data }))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function client(chainId: ChainId) {
  return createPublicClient({ chain: chainId === 56 ? bsc : bscTestnet, transport: fallback(RPC[chainId].map((u) => http(u, { timeout: 20_000, retryCount: 2 }))) })
}

async function rpc(url: string, method: string, params: unknown[]): Promise<{ result?: unknown; error?: { message: string } }> {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((r) => r.json() as Promise<{ result?: unknown; error?: { message: string } }>)
}

async function settle(chainId: ChainId, jobId: bigint): Promise<{ tx: Hex; sponsored: boolean }> {
  const pub = client(chainId)
  const router = NETWORKS[chainId].router
  const data = encodeFunctionData({ abi: evaluatorRouterAbi, functionName: 'settle', args: [jobId, '0x'] })
  const gas = (await pub.estimateGas({ account, to: router, data })) * 13n / 10n
  const nonce = await pub.getTransactionCount({ address: account.address, blockTag: 'pending' })
  const sp = await rpc(MEGAFUEL[chainId], 'pm_isSponsorable', [{ from: account.address, to: router, value: '0x0', data, gas: `0x${gas.toString(16)}` }]).catch(() => ({}))
  const sponsored = (sp as { result?: { sponsorable?: boolean } }).result?.sponsorable === true
  const chain = chainId === 56 ? bsc : bscTestnet
  if (sponsored) {
    const signed = await account.signTransaction({ chainId, to: router, data, gas, gasPrice: 0n, nonce, value: 0n, type: 'legacy' })
    const r = await rpc(MEGAFUEL[chainId], 'eth_sendRawTransaction', [signed])
    if (r.error) throw new Error(`megafuel: ${r.error.message}`)
    const tx = r.result as Hex
    await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 })
    return { tx, sponsored: true }
  }
  const bal = await pub.getBalance({ address: account.address })
  if (bal < MIN_BNB) throw new Error(`not sponsored and balance ${formatEther(bal)} BNB is under the ${formatEther(MIN_BNB)} floor`)
  const w = createWalletClient({ account, chain, transport: http(RPC[chainId][0]) })
  const tx = await w.sendTransaction({ to: router, data, gas, nonce })
  await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 })
  return { tx, sponsored: false }
}

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

async function tick(): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = { at: new Date().toISOString(), keeper: account.address, chains: {} }
  for (const chainId of CHAINS) {
    const pub = client(chainId)
    const bal = await pub.getBalance({ address: account.address }).catch(() => null)
    if (bal !== null && bal < MIN_BNB) log('balance_low', { chainId, balance: formatEther(bal), floor: formatEther(MIN_BNB) })
    const window = await pub.readContract({ address: NETWORKS[chainId].policy, abi: [{ type: 'function', name: 'disputeWindow', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const, functionName: 'disputeWindow' })
    const jobs = rowsOf(await db().execute(sql`select job_id from commerce_job where chain_id = ${chainId} and state = 'SUBMITTED' and intent_id is not null order by job_id::numeric limit 200`))
    const now = BigInt(Math.floor(Date.now() / 1000))
    const due: bigint[] = []
    for (const j of jobs) {
      const id = BigInt(String(j['job_id']))
      const job = await pub.readContract({ address: NETWORKS[chainId].commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [id] }) as { status: number; submittedAt: bigint }
      if (job.status === 2 && job.submittedAt > 0n && now > job.submittedAt + window) due.push(id)
    }
    const done: Array<Record<string, unknown>> = []
    for (const id of due) {
      const hourAgo = Date.now() - 3600_000
      while (sent.length && sent[0]! < hourAgo) sent.shift()
      if (sent.length >= MAX_PER_HOUR) { log('cap_reached', { chainId, perHour: MAX_PER_HOUR, waiting: due.length - done.length }); break }
      if (DRY) { done.push({ jobId: id.toString(), dryRun: true }); continue }
      try {
        const r = await settle(chainId, id)
        sent.push(Date.now())
        done.push({ jobId: id.toString(), ...r })
        log('settled', { chainId, jobId: id.toString(), ...r })
      } catch (err) {
        log('settle_error', { chainId, jobId: id.toString(), error: err instanceof Error ? err.message.slice(0, 200) : String(err) })
      }
    }
    ;(summary.chains as Record<string, unknown>)[chainId] = { balanceBnb: bal === null ? null : formatEther(bal), floorBnb: formatEther(MIN_BNB), disputeWindowSeconds: Number(window), submittedBound: jobs.length, due: due.length, settled: done }
  }
  summary['settlesLastHour'] = sent.length
  summary['capPerHour'] = MAX_PER_HOUR
  try { writeFileSync(`${DIR}/status.json`, JSON.stringify(summary, null, 2)) } catch { /* status is best effort */ }
  return summary
}

async function main(): Promise<void> {
  log('start', { keeper: account.address, chains: CHAINS, tickMs: TICK_MS, maxPerHour: MAX_PER_HOUR, minBnb: formatEther(MIN_BNB), dryRun: DRY })
  do {
    try { const s = await tick(); log('tick', { chains: s['chains'] }) } catch (err) { log('tick_error', { error: err instanceof Error ? err.message.slice(0, 300) : String(err) }) }
    if (!ONCE && !stopping) await sleep(TICK_MS)
  } while (!ONCE && !stopping)
  await closeDb()
}

main().catch((err) => { console.error(err); process.exit(1) })
