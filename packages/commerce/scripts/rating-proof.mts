/**
 * P2-04 TESTNET PROOF. The P2-02 test wallet rates the four agents it hired, through
 * Marque's public rate API (guards + comment) and its own signature; then an owner
 * self-rating attempt, which must be refused with the mapped error; then one extra
 * rating that is revoked, so FeedbackRevoked is seen on chain at least once.
 *
 *   tsx scripts/rating-proof.mts [--base https://marque.trade]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { chainClient } from '../src/chain.js'
import { reputationAbi, REPUTATION_REGISTRY } from '../src/reputation.js'
import { friendlyError } from '../src/errors.js'

const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1]! : 'https://marque.trade'
const pk = (JSON.parse(readFileSync('/root/.marque/test-wallets/p2-02-testnet.json', 'utf8')) as { privateKey: Hex }).privateKey
const account = privateKeyToAccount(pk)
const pub = chainClient(97)
const wallet = createWalletClient({ account, chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com') })
const log = (...m: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...m)

type Prepared = { call: { to: Hex; args: string[] }; feedbackHash: Hex; agentId: string }
async function prepare(jobId: string, stars: number, comment?: string, who = account.address): Promise<Prepared | { error: string; detail: string }> {
  const r = await fetch(`${BASE}/api/v1/phase2/rate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: 97, jobId, wallet: who, stars, ...(comment ? { comment } : {}) }) })
  return r.json() as Promise<Prepared | { error: string; detail: string }>
}
const asArgs = (a: string[]) => [BigInt(a[0]!), BigInt(a[1]!), Number(a[2]), a[3]!, a[4]!, a[5]!, a[6]!, a[7] as Hex] as const

const q = await (await fetch(`${BASE}/api/v1/phase2/wallet/${account.address}?chainId=97`)).json() as { quest: { categories: Record<string, { jobKey: string | null }> } }
const plan: Array<[string, string, number, string]> = Object.entries(q.quest.categories).map(([cat, c], i) => [cat, c.jobKey!.split(':')[1]!, [5, 4, 5, 3][i]!, `Testnet proof rating for the ${cat.replace('_', ' ')} hire.`])
const evidence: Record<string, unknown> = { chainId: 97, base: BASE, wallet: account.address, startedAt: new Date().toISOString(), ratings: [] as unknown[] }

for (const [category, jobId, stars, comment] of plan) {
  const p = await prepare(jobId, stars, comment)
  if ('error' in p) { log(category, jobId, 'REFUSED', p.error, p.detail); (evidence.ratings as unknown[]).push({ category, jobId, refused: p }); continue }
  const tx = await wallet.writeContract({ address: p.call.to, abi: reputationAbi, functionName: 'giveFeedback', args: asArgs(p.call.args) })
  const r = await pub.waitForTransactionReceipt({ hash: tx })
  log(`${category.padEnd(14)} job ${jobId} agent ${p.agentId} ${stars}/5 -> ${r.status} https://testnet.bscscan.com/tx/${tx}`)
  ;(evidence.ratings as unknown[]).push({ category, jobId, agentId: p.agentId, stars, feedbackHash: p.feedbackHash, tx, status: r.status })
}

// Owner self-rating: Keel's own wallet tries to rate Keel (testnet agent 2238). Simulated, so
// no gas is spent; the contract's revert is decoded and mapped to the buyer-facing sentence.
const keelOwner = '0xdF1074a272C53A1a10b96Fa0201Eb58bbbaaFe00' as Hex
try {
  await pub.simulateContract({ account: keelOwner, address: REPUTATION_REGISTRY[97], abi: reputationAbi, functionName: 'giveFeedback', args: [2238n, 100n, 0, 'starred', 'marque:health_factor', '', '', `0x${'00'.repeat(32)}`] })
  log('SELF-RATING WAS NOT REFUSED'); evidence.selfRating = { refused: false }
} catch (err) {
  const f = friendlyError(err)
  const raw = (err as Error).message.split('\n').find((l) => /revert|reason|Error:/i.test(l)) ?? (err as Error).message.split('\n')[0]
  log('self-rating refused by the contract:', raw, '->', f.title)
  evidence.selfRating = { refused: true, raw, mapped: f }
}
// And through Marque's guard (the owner is not the job's client, so it is refused first).
evidence.selfRatingApi = await prepare(plan[3]![1], 5, undefined, keelOwner)
log('API guard for the owner:', JSON.stringify(evidence.selfRatingApi))

// One more rating on the duplicate Lattice job, then revoked.
const dup = await prepare('1348', 2, 'Rated and then revoked, to prove FeedbackRevoked is indexed.')
if (!('error' in dup)) {
  const tx = await wallet.writeContract({ address: dup.call.to, abi: reputationAbi, functionName: 'giveFeedback', args: asArgs(dup.call.args) })
  await pub.waitForTransactionReceipt({ hash: tx })
  const idx = await pub.readContract({ address: REPUTATION_REGISTRY[97], abi: reputationAbi, functionName: 'getLastIndex', args: [BigInt(dup.agentId), account.address] })
  const revokeAbi = [{ type: 'function', name: 'revokeFeedback', stateMutability: 'nonpayable', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'feedbackIndex', type: 'uint64' }], outputs: [] }] as const
  const rtx = await wallet.writeContract({ address: REPUTATION_REGISTRY[97], abi: revokeAbi, functionName: 'revokeFeedback', args: [BigInt(dup.agentId), idx] })
  const rr = await pub.waitForTransactionReceipt({ hash: rtx })
  log(`revoke: rated job 1348 (${tx}), revoked index ${idx} -> ${rr.status} https://testnet.bscscan.com/tx/${rtx}`)
  evidence.revoke = { jobId: '1348', agentId: dup.agentId, rateTx: tx, feedbackIndex: idx.toString(), revokeTx: rtx, status: rr.status }
} else { log('dup prepare refused', dup); evidence.revoke = { refused: dup } }

evidence.finishedAt = new Date().toISOString()
const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/phase2/evidence/testnet-rating-proof.json')
writeFileSync(file, JSON.stringify(evidence, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n')
log('evidence written', file)
