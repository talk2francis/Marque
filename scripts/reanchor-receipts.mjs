#!/usr/bin/env node
/**
 * Re-anchor the receipts that were issued while the box was compromised and the
 * anchor worker was being killed mid-run (P10.5C item 3). The runs are real and
 * their receipts render fine; they just never got their MarqueRegistry anchor.
 *
 * BSC TESTNET only — MarqueRegistry.anchor(bytes32) on chain 97. No mainnet
 * gate. Idempotent: it only touches rows where anchor_tx_hash IS NULL, and
 * MarqueRegistry.anchor is itself idempotent per leaf.
 *
 *   node scripts/reanchor-receipts.mjs            # dry run — lists what it would do
 *   node scripts/reanchor-receipts.mjs --go       # send the anchor transactions
 *
 * `apps/web/lib/anchor.ts` does the same call but imports 'server-only', so it
 * cannot run outside Next. This is the standalone equivalent.
 */
import postgres from 'postgres'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'

const GO = process.argv.includes('--go')

const REGISTRY = process.env.MARQUE_REGISTRY_ADDRESS_TESTNET
const PK = process.env.MARQUE_TESTNET_PK
const RPC = (process.env.BSC_TESTNET_RPC || '').split(',')[0].trim()
const DB = process.env.DATABASE_URL
if (!REGISTRY || !PK || !RPC || !DB) {
  console.error('need MARQUE_REGISTRY_ADDRESS_TESTNET, MARQUE_TESTNET_PK, BSC_TESTNET_RPC, DATABASE_URL — source /root/.marque/secrets.env')
  process.exit(1)
}

const abi = [{ type: 'function', name: 'anchor', stateMutability: 'nonpayable', inputs: [{ name: 'leaf', type: 'bytes32' }], outputs: [] }]

const sql = postgres(DB, { max: 1 })
const account = privateKeyToAccount(PK)
const transport = http(RPC, { timeout: 30_000 })
const pub = createPublicClient({ chain: bscTestnet, transport })
const wallet = createWalletClient({ account, chain: bscTestnet, transport })

const rows = await sql`
  select id, agent_id, hash from receipt
  where anchor_tx_hash is null and hash ~ '^0x[0-9a-f]{64}$'
  order by issued_at
`
console.log(`# reanchor — ${rows.length} unanchored receipt(s)${GO ? '' : ' (dry run)'}\n`)
if (!rows.length) { await sql.end(); process.exit(0) }

if (!GO) {
  for (const r of rows) console.log(`  ${r.id}  ${r.agent_id.padEnd(18)} ${r.hash}`)
  console.log('\npass --go to anchor them')
  await sql.end()
  process.exit(0)
}

let done = 0
for (const r of rows) {
  try {
    const hash = await wallet.writeContract({
      address: REGISTRY, abi, functionName: 'anchor', args: [r.hash], chain: bscTestnet, account,
    })
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 })
    if (receipt.status !== 'success') throw new Error(`anchor tx ${hash} reverted`)
    await sql`
      update receipt set anchor_tx_hash = ${hash}, anchor_block = ${receipt.blockNumber.toString()}, anchored_at = now()
      where id = ${r.id}
    `
    console.log(`  ✓ ${r.agent_id.padEnd(18)} ${r.hash.slice(0, 14)}…  tx ${hash}  block ${receipt.blockNumber}`)
    done++
  } catch (err) {
    console.error(`  ✗ ${r.id} — ${err instanceof Error ? err.message.split('\n')[0] : err}`)
  }
}
console.log(`\n${done}/${rows.length} anchored.`)
await sql.end()
