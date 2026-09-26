/**
 * P2-02 TESTNET PROOF. Real transactions on BSC testnet (97) from a fresh test wallet,
 * through Marque's public hire API and the same call builders the hire sheet uses.
 *
 *   tsx scripts/hire-proof.mts [--base https://marque.trade] [--only keel,bound] [--mainnet]
 *
 * Testnet by default. --mainnet (P2-05 smoke, after G-M1 and G-M2) uses the separate,
 * Francis-funded smoke wallet in /root/.marque/test-wallets/p2-05-mainnet.json and never
 * funds itself. Keys live in /root/.marque/test-wallets (0600), never in the repo.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createPublicClient, fallback, createWalletClient, http, parseEther, formatEther, erc20Abi, type Hex, type Address } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { chainClient } from '../src/chain.js'
import { logsClient } from '../src/indexer.js'
import { NETWORKS, formatAmount } from '../src/config.js'
import { createJobCall, paymentCalls, cancelCall, approveCall, revokeAllowanceCall, type Call, type HireTerms } from '../src/calls.js'
import { agenticCommerceAbi } from '../src/generated.js'
import { decodeEventLog } from 'viem'

const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1]! : 'https://marque.trade'
const MAINNET = args.includes('--mainnet')
const CHAIN = (MAINNET ? 56 : 97) as 56 | 97
const CHAIN_DEF = MAINNET ? bsc : bscTestnet
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..')
const WALLET_DIR = '/root/.marque/test-wallets'
const U_FAUCET = '0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3' as Address

const AGENTS = [
  { slug: 'sluicegate', agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341555', category: 'yield', task: 'Where should 1000 USDT earn the most on Venus or Lista right now, net of switching cost?' },
  ...(MAINNET ? [{ slug: 'tidemark', agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:358786', category: 'yield', task: 'Where should 1000 USDT earn the most on BNB Chain over the last 7 days, after switching costs?' }] : []),
  { slug: 'lattice', agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341554', category: 'grid', task: 'Plan a 10-level arithmetic grid for BNB/USDT between 550 and 700 with 500 USDT, stop at 520.' },
  { slug: 'bound', agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341553', category: 'rebalancing', task: 'Re-centre PancakeSwap V3 position 7395979 symmetrically at +-6% on its fee tier.' },
  { slug: 'keel', agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556', category: 'health_factor', task: 'Health factor of Venus account 0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf and the repay that restores it to 2.5.' },
].filter((a) => !ONLY || ONLY.includes(a.slug))

// Mainnet: send and read receipts through BNB Chain's own dataseeds (publicnode was
// returning Cloudflare errors for receipts on 26 Sep); log searches go to logsClient.
const MAINNET_RPC = ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.defibit.io', 'https://bsc-dataseed1.ninicoin.io']
const pub = MAINNET ? createPublicClient({ chain: bsc, transport: fallback(MAINNET_RPC.map((u) => http(u, { timeout: 20_000, retryCount: 3 }))) }) as unknown as ReturnType<typeof chainClient> : chainClient(CHAIN)
const logsPub = logsClient(CHAIN)
const log = (...m: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...m)
const explorer = (h: string) => `https://${MAINNET ? '' : 'testnet.'}bscscan.com/tx/${h}`

async function post<T>(route: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json() as T & { error?: string; detail?: string }
  if (!res.ok) throw new Error(`${route} ${res.status}: ${j.error} ${j.detail}`)
  return j
}

// Fresh throwaway wallet (or reuse this run's, if resuming).
mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 })
const walletFile = path.join(WALLET_DIR, MAINNET ? 'p2-05-mainnet.json' : 'p2-02-testnet.json')
let pk: Hex
if (existsSync(walletFile)) pk = JSON.parse(readFileSync(walletFile, 'utf8')).privateKey
else if (MAINNET) throw new Error('no mainnet smoke wallet')
else { pk = generatePrivateKey(); writeFileSync(walletFile, JSON.stringify({ privateKey: pk, purpose: 'P2-02 testnet hire proof, chain 97 only', createdAt: new Date().toISOString() }), { mode: 0o600 }) }
const account = privateKeyToAccount(pk)
const wallet = createWalletClient({ account, chain: CHAIN_DEF, transport: http(MAINNET ? 'https://bsc-dataseed.bnbchain.org' : (process.env.BSC_TESTNET_RPC ?? '').split(',')[0]) })
log('test wallet', account.address)

// Record it as a team wallet so it can never count toward the quest (SPEC-TRACKING 9).
const teamFile = path.join(ROOT, 'config/team-wallets.json')
const team = existsSync(teamFile) ? JSON.parse(readFileSync(teamFile, 'utf8')) : { wallets: [] }
if (!team.wallets.some((w: { address: string }) => w.address.toLowerCase() === account.address.toLowerCase())) {
  team.wallets.push({ address: account.address, role: 'test wallet (P2-02 testnet hire proof)', chainIds: [97] })
  writeFileSync(teamFile, JSON.stringify(team, null, 2) + '\n')
}

const evidence: Record<string, unknown> = { chainId: CHAIN, base: BASE, wallet: account.address, startedAt: new Date().toISOString(), funding: {}, hires: [], cancel: null, revoke: null }

async function send(c: Call): Promise<Hex> {
  if (c.chainId !== CHAIN) throw new Error(`call is for chain ${c.chainId}, run is on ${CHAIN}`)
  const hash = await wallet.writeContract({ address: c.to, abi: c.abi, functionName: c.functionName as never, args: c.args as never, account, chain: CHAIN_DEF })
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 })
  if (r.status !== 'success') throw new Error(`${c.step} reverted: ${hash}`)
  log(`  ${c.label.padEnd(44)} ${explorer(hash)}`)
  return hash
}

// Fund gas from the Marque testnet operator, then claim test U from the faucet.
const tbnb = await pub.getBalance({ address: account.address })
if (MAINNET && tbnb < parseEther('0.001')) throw new Error('smoke wallet needs BNB for gas')
if (!MAINNET && tbnb < parseEther('0.004')) {
  const opPk = process.env.MARQUE_TESTNET_PK as Hex | undefined
  if (!opPk) throw new Error('MARQUE_TESTNET_PK not set')
  const op = privateKeyToAccount(opPk)
  const opWallet = createWalletClient({ account: op, chain: bscTestnet, transport: http((process.env.BSC_TESTNET_RPC ?? '').split(',')[0]) })
  const h = await opWallet.sendTransaction({ to: account.address, value: parseEther('0.008'), account: op, chain: bscTestnet })
  await pub.waitForTransactionReceipt({ hash: h })
  ;(evidence.funding as Record<string, string>).tbnb = h
  log('funded 0.008 tBNB from the testnet operator', explorer(h))
}
const U = NETWORKS[CHAIN].kernelToken
const uBal = await pub.readContract({ address: U, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })
if (!MAINNET && uBal < parseEther('1')) {
  const faucetAbi = [{ type: 'function', name: 'requestTokens', stateMutability: 'nonpayable', inputs: [], outputs: [] }] as const
  const h = await wallet.writeContract({ address: U_FAUCET, abi: faucetAbi, functionName: 'requestTokens', account, chain: bscTestnet })
  await pub.waitForTransactionReceipt({ hash: h })
  ;(evidence.funding as Record<string, string>).faucetU = h
  log('claimed test U from the official faucet', explorer(h))
}
log('balances', formatEther(await pub.getBalance({ address: account.address })), 'tBNB,', formatEther(await pub.readContract({ address: U, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })), 'U')

type Q = { quoteId: number; agentName: string; chainId: 56 | 97; provider: Address; price: string; priceLabel: string; token: HireTerms['token'] & { address: Address }; signed: boolean }
type I = { intentId: string; expiredAt: string; description: string; descriptionHash: string; refundAfter: string; createJob: { functionName: string } }

async function openJob(a: (typeof AGENTS)[number]) {
  const q = await post<Q>('hire/quote', { agentId: a.agentId, task: a.task })
  if (q.chainId !== CHAIN) throw new Error(`${a.slug} quoted on chain ${q.chainId}; this run is on ${CHAIN}`)
  log(`${q.agentName}: quote ${q.priceLabel} (${q.signed ? 'signed' : 'unsigned'}), provider ${q.provider}`)
  const i = await post<I>('hire/intent', { wallet: account.address, quoteId: q.quoteId })
  const terms: HireTerms = { chainId: CHAIN, provider: q.provider, token: q.token, price: BigInt(q.price), priceLabel: q.priceLabel, agentName: q.agentName, expiredAt: BigInt(i.expiredAt), description: i.description }
  const createTx = await send(createJobCall(terms))
  const bound = await post<{ jobId: string }>('hire/bind', { intentId: i.intentId, txHash: createTx })
  log(`  job ${bound.jobId} bound to intent ${i.intentId}; refundable after ${i.refundAfter}`)
  return { q, i, terms, createTx, jobId: BigInt(bound.jobId) }
}

for (const a of AGENTS) {
  const started = Date.now()
  const { q, i, terms, createTx, jobId } = await openJob(a)
  const allowance = await pub.readContract({ address: U, abi: erc20Abi, functionName: 'allowance', args: [account.address, NETWORKS[CHAIN].commerce] })
  const tx: Record<string, string> = { createJob: createTx }
  for (const c of paymentCalls(terms, jobId, allowance)) tx[c.step] = await send(c)
  const n = await post<{ accepted: boolean; status: string | null }>('hire/notify', { chainId: CHAIN, jobId: jobId.toString() })
  log(`  seller notified: accepted=${n.accepted}`)
  // Wait for the seller to deliver on chain (JobSubmitted).
  let submitted: string | null = null
  for (let t = 0; t < 60 && !submitted; t++) {
    const job = await pub.readContract({ address: NETWORKS[CHAIN].commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [jobId] }) as { status: number }
    if (job.status >= 2) {
      const head = await pub.getBlockNumber()
      const logs = await logsPub.getLogs({ address: NETWORKS[CHAIN].commerce, fromBlock: head - 4000n, toBlock: head, event: agenticCommerceAbi.find((x) => x.type === 'event' && x.name === 'JobSubmitted') as never, args: { jobId } as never })
      submitted = (logs as Array<{ transactionHash: string }>)[0]?.transactionHash ?? 'status>=SUBMITTED'
    } else await new Promise((r) => setTimeout(r, 10_000))
  }
  if (submitted) log(`  DELIVERED ${explorer(submitted)} after ${Math.round((Date.now() - started) / 1000)}s`)
  else log('  not delivered within 10 minutes (the job stays refundable after', i.refundAfter, ')')
  // Delivered is not the same as useful: job 1337 was delivered and its answer was
  // an error. Read the public deliverable and record which it was.
  let deliverable: { url: string; ok: boolean; error: string | null; keys: string[] } | null = null
  if (submitted) {
    const url = `${BASE}/agents/${a.slug}/erc8183/job/${jobId}/response`
    const body = await fetch(url).then((r) => r.json()).catch(() => null) as { response?: { content?: string } } | null
    let content: Record<string, unknown> | null = null
    try { content = JSON.parse(body?.response?.content ?? 'null') } catch { content = null }
    const error = content === null ? 'deliverable unreadable' : typeof content.error === 'string' ? content.error : null
    deliverable = { url, ok: error === null, error, keys: content ? Object.keys(content) : [] }
    log(error === null ? `  ANSWER OK (${deliverable.keys.slice(0, 5).join(', ')})` : `  ANSWER IS AN ERROR: ${error}`)
  }
  ;(evidence.hires as unknown[]).push({
    category: a.category, agent: q.agentName, agentId: a.agentId, jobId: jobId.toString(), price: q.priceLabel, signedQuote: q.signed,
    signatures: Object.keys(tx).length, batched: false, tx: { ...tx, submit: submitted }, intentId: i.intentId, notified: n.accepted, deliverable,
    seconds: Math.round((Date.now() - started) / 1000),
  })
}

// Cancel before paying.
if (!ONLY || ONLY.includes('cancel')) {
  const a = AGENTS[0] ?? { slug: 'keel', agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556', category: 'health_factor', task: 'Health factor of 0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf' }
  const { createTx, jobId } = await openJob(a)
  const cancelTx = await send(cancelCall(CHAIN, jobId))
  evidence.cancel = { jobId: jobId.toString(), createJob: createTx, cancel: cancelTx }
}

// Approve exactly, then revoke to zero.
const tok = { address: U, symbol: 'U', decimals: 18, isDefault: true }
const approveTx = await send(approveCall(CHAIN, tok, parseEther('0.05'), '0.05 U'))
const revokeTx = await send(revokeAllowanceCall(CHAIN, tok))
const after = await pub.readContract({ address: U, abi: erc20Abi, functionName: 'allowance', args: [account.address, NETWORKS[CHAIN].commerce] })
evidence.revoke = { approve: approveTx, revoke: revokeTx, allowanceAfter: after.toString() }
log('allowance after revoke:', formatAmount(after, 18), 'U')

evidence.finishedAt = new Date().toISOString()
writeFileSync(path.join(ROOT, `docs/phase2/evidence/${MAINNET ? 'mainnet-smoke' : 'testnet-hire-proof'}.json`), JSON.stringify(evidence, null, 2) + '\n')
log(`evidence written (${MAINNET ? 'mainnet-smoke' : 'testnet-hire-proof'}.json)`)
void decodeEventLog
