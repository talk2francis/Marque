/**
 * P2-03: every quest event's topic0, three ways. (1) the value SPEC-TRACKING publishes,
 * (2) keccak256 of the signature in the ABI we decode with, (3) topic0 of a REAL log read
 * back from chain. Writes docs/phase2/evidence/verify-topics.json, which /api/v1/phase2/config
 * serves. An event with no log in reach is reported as not yet seen, never as verified.
 *
 *   tsx scripts/verify-topics.mts
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { toEventSelector, type AbiEvent, type Abi } from 'viem'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { contractsOf, logsClient, LOG_WINDOW } from '../src/indexer.js'
import { chainClient } from '../src/chain.js'
import type { ChainId } from '../src/config.js'

const SPEC: Record<string, { contract: string; topic0: string }> = {
  JobCreated: { contract: 'commerce', topic0: '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9' },
  BudgetSet: { contract: 'commerce', topic0: '0x869e2577b006bf47ee981cf6fec2e25583548081c14b98deab587f77b5068038' },
  JobFunded: { contract: 'commerce', topic0: '0xbdb056de345bfeadca7c9fd7df6430bdb83c677c8eefbb601dff56f34d3dac52' },
  JobSubmitted: { contract: 'commerce', topic0: '0x80c17db79857f338a6a6df68a6883ecc0ce78e2202fe61ed979733573f40538e' },
  JobCompleted: { contract: 'commerce', topic0: '0x0fd54bd364fa9e67f17b091aefe930932c09fe7651cf5ad02c71a418f3341444' },
  PaymentReleased: { contract: 'commerce', topic0: '0x21d71db5be59bb9fa133895586b7404307dd33fb93b16db09dc6f1d9d7d231b0' },
  JobRejected: { contract: 'commerce', topic0: '0xae7362b1af91f4492868987b9c73990d780060811551b58728fbe96fd1bab275' },
  JobExpired: { contract: 'commerce', topic0: '0x97237956f8810192811e2c3f273fd02c5d6295206fdd9c62e6fe2bfc19ba9232' },
  Refunded: { contract: 'commerce', topic0: '0x7ca5472b7ea78c2c0141c5a12ee6d170cf4ce8ed06be3d22c8252ddfc7a6a2c4' },
  JobRegistered: { contract: 'router', topic0: '0xab6d9121f9311dd45d0b932fc9fb1a6562295bda63d5bab95e364ff926515715' },
  JobSettled: { contract: 'router', topic0: '0x771fbd01246ab044986d0a55b6d9b732fcfd6d7eaa5ee0d05110b0d23cf496fc' },
  Disputed: { contract: 'policy', topic0: '0xcde8e21e97a7f6ec4bbf0ee44450212e0ba73be8fdfbfb2b155e861d86756bac' },
  NewFeedback: { contract: 'reputation', topic0: '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc' },
  FeedbackRevoked: { contract: 'reputation', topic0: '0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d' },
}

const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const out: Record<string, unknown> = {}
for (const [name, spec] of Object.entries(SPEC)) {
  const abiSelectors: string[] = []
  for (const chainId of [56, 97] as ChainId[]) {
    const c = contractsOf(chainId).find((x) => x.key === spec.contract)!
    const ev = (c.abi as Abi).find((x) => x.type === 'event' && x.name === name) as AbiEvent | undefined
    if (ev) abiSelectors.push(toEventSelector(ev))
  }
  const abiTopic = abiSelectors[0] ?? null
  let seen: { chainId: number; tx: string; block: number; topic0: string } | null = null
  // A stored event first: re-read its receipt from chain and take topic0 from the raw log.
  const [stored] = rows(await db().execute(sql`select chain_id, tx_hash, log_index from commerce_event where name = ${name} order by chain_id desc, block_number desc limit 1`))
  if (stored) {
    const chainId = Number(stored['chain_id']) as ChainId
    const r = await chainClient(chainId).getTransactionReceipt({ hash: stored['tx_hash'] as `0x${string}` })
    const log = r.logs.find((l) => l.logIndex === Number(stored['log_index']))
    if (log) seen = { chainId, tx: r.transactionHash, block: Number(r.blockNumber), topic0: log.topics[0] ?? '' }
  }
  // Otherwise search what the public log window serves, on both chains, by the spec topic.
  for (const chainId of [56, 97] as ChainId[]) {
    if (seen) break
    const client = logsClient(chainId)
    const head = await client.getBlockNumber()
    const address = contractsOf(chainId).find((x) => x.key === spec.contract)!.address
    for (let to = head; to > head - LOG_WINDOW[chainId] && !seen; to -= 2_000n) {
      // Raw eth_getLogs: viem's getLogs drops a bare topics filter.
      const logs = await client.request({ method: 'eth_getLogs', params: [{ address, fromBlock: `0x${(to - 1_999n).toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [spec.topic0] }] } as never).catch(() => []) as Array<{ transactionHash: string; blockNumber: string; topics: string[] }>
      const l = logs[0]
      if (l) seen = { chainId, tx: l.transactionHash, block: Number(l.blockNumber), topic0: l.topics[0] ?? '' }
    }
  }
  const verified = Boolean(seen && seen.topic0.toLowerCase() === spec.topic0 && abiTopic === spec.topic0)
  out[name] = {
    topic0: spec.topic0, abiTopic0: abiTopic, abiMatchesSpec: abiTopic === spec.topic0, contract: spec.contract,
    verified, chainId: seen?.chainId ?? null, tx: seen?.tx ?? null, block: seen?.block ?? null,
    note: seen ? (verified ? 'topic0 read from a real log' : `real log topic0 ${seen.topic0} differs`) : 'no log in reach yet (public RPCs serve only the newest blocks)',
  }
  console.log(`${verified ? 'OK     ' : seen ? 'DIFFERS' : 'NO LOG '} ${name.padEnd(16)} ${spec.topic0.slice(0, 18)}…  abi=${abiTopic === spec.topic0 ? 'match' : abiTopic ?? 'absent'}  ${seen ? `chain ${seen.chainId} tx ${seen.tx}` : ''}`)
}
const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/phase2/evidence/verify-topics.json')
writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), events: out }, null, 2) + '\n')
console.log('written', file)
await closeDb()
