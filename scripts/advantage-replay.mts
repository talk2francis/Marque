/**
 * Agent Advantage repair — Phase B (historical agent replay).
 *
 *   pnpm tsx scripts/advantage-replay.mts --dry-run
 *   pnpm tsx scripts/advantage-replay.mts --benchmark ADV-01 --apply
 *   pnpm tsx scripts/advantage-replay.mts --apply           all eligible, sequentially
 *
 * For each eligible ADV, runs the agent arm TWICE against the exact block the
 * frozen benchmark task already pins, using the archive endpoint. It never
 * re-registers the frozen benchmark and never touches the human runs. Each
 * replay is its own `replay-` batch; running it again for a benchmark that
 * already has one refuses rather than stacking a competing set.
 *
 * A repetition whose engine reports a block other than the pinned one is
 * recorded with an INVALID note and is NOT a valid repetition — a state-access
 * failure, not the agent's quality.
 *
 * This is READ-ONLY with respect to BNB Smart Chain: eth_call / getCode /
 * getStorageAt / block reads only. No transaction, no anchor, no signature.
 */
import { BENCHMARKS, loadFrozenBenchmark, runComparisonReplay, benchmarkStatus, pinnedBlockOf } from '@marque/ledger'
import { hasArchive, archiveClient } from '@marque/chain'

const APPLY = process.argv.includes('--apply')
const bIx = process.argv.indexOf('--benchmark')
const ONLY = bIx > -1 ? process.argv[bIx + 1] : null
const BASE = process.env.MARQUE_PUBLIC_URL ?? 'https://marque.trade'

if (!hasArchive()) {
  console.error('BSC_ARCHIVE_RPC_URL is not set — historical replay needs an archive endpoint. Aborting.')
  process.exit(1)
}

const targets = BENCHMARKS.filter((b) => (ONLY ? b.id === ONLY : /^ADV-\d+$/.test(b.id)))

for (const spec of targets) {
  console.log('\n' + '='.repeat(72))
  console.log(spec.id, '·', spec.title)

  const frozen = await loadFrozenBenchmark(spec.id)
  const pinned = frozen.block ?? pinnedBlockOf(frozen.task)
  if (!pinned) { console.log('  SKIP — frozen task does not pin exactly one block'); continue }
  console.log(`  frozen task hash : ${frozen.taskHash}`)
  console.log(`  pinned block     : ${pinned}`)

  // Prove the archive endpoint can actually serve this block's state, not just
  // its header, before committing the replay.
  const client = archiveClient()!
  try {
    const blk = await client.getBlock({ blockNumber: BigInt(pinned) })
    const code = await client.getCode({ address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', blockNumber: BigInt(pinned) })
    console.log(`  archive check    : block ${blk.number} hash ${blk.hash.slice(0, 18)}… · WBNB code ${(code ?? '0x').length} bytes`)
    if (!code || code === '0x') { console.log('  SKIP — archive returned no historical contract state'); continue }
  } catch (e) {
    console.log(`  SKIP — archive read failed: ${e}`); continue
  }

  const before = await benchmarkStatus(spec.id)
  console.log(`  before           : agent ${before.agentReps}/2 · manual ${before.manualReps}/2 · ${before.complete ? 'COMPLETE' : 'incomplete'}`)
  console.log(`  before missing   : ${before.missing.join('; ') || '(nothing)'}`)

  if (!APPLY) { console.log('  dry run — no replay executed'); continue }

  console.log('  replaying agent arm x2 at the pinned block…')
  const { batch, block, blockHash, results } = await runComparisonReplay(spec.id, { baseUrl: BASE, reps: 2 })
  for (const r of results) {
    console.log(`    rep ${r.rep}: ${r.ok ? 'answered' : 'NOT VALID'}  ${String(r.elapsedMs).padStart(6)}ms  ${r.detail ?? ''}`)
  }
  console.log(`  batch ${batch} · block ${block} · hash ${blockHash ?? '(none)'}`)

  const after = await benchmarkStatus(spec.id)
  console.log(`  after            : agent ${after.agentReps}/2 · manual ${after.manualReps}/2 · ${after.complete ? 'COMPLETE' : 'incomplete'}`)
  console.log(`  after missing    : ${after.missing.join('; ') || '(nothing — grade the new agent reps next)'}`)
}

console.log('\n' + (APPLY ? 'replay complete — run: node scripts/ledger-grade.mjs --go' : 'dry run only'))
