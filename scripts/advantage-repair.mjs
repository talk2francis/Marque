#!/usr/bin/env node
/**
 * Agent Advantage repair — Phase A (provenance + evidence, no chain writes).
 *
 *   node scripts/advantage-repair.mjs                 dry run, all four ADVs
 *   node scripts/advantage-repair.mjs --benchmark ADV-03
 *   node scripts/advantage-repair.mjs --apply         write provenance supplements
 *
 * WHAT THIS DOES
 *
 * Some early manual runs recorded block_number = 0 because the intake did not
 * copy the block from the task. The block IS recoverable: the run's manifest
 * task_hash matches an immutable frozen benchmark task that pins exactly one
 * block. This tool records that recovery in an APPEND-ONLY supplement
 * (benchmark_run_provenance) and NEVER touches the raw run row. It also
 * back-fills the sitting's screen-recording URL onto the repetition that lacks
 * it.
 *
 * WHAT IT REFUSES TO DO
 *
 * - assign a block that is not the single one encoded in the frozen task
 * - touch a run whose manifest task_hash does not match the registered task
 * - run when the two manual reps disagree on which task they answered
 * - write anything on --dry-run
 * - write a second supplement for a run that already has one (idempotent)
 */
import postgres from 'postgres'

const APPLY = process.argv.includes('--apply')
const bIx = process.argv.indexOf('--benchmark')
const ONLY = bIx > -1 ? process.argv[bIx + 1] : null
const REPAIR_VERSION = 'phaseA-2026-09-09'

const DB = process.env.DATABASE_URL
if (!DB) { console.error('DATABASE_URL not set'); process.exit(1) }
const ARCHIVE = process.env.BSC_ARCHIVE_RPC_URL?.trim() || null

const sql = postgres(DB, { max: 2 })

/** The one screen recording per sitting. Corroborating evidence, not the block proof. */
const RECORDINGS = {
  'ADV-01': 'https://youtu.be/pt0EkL6wY6A',
  'ADV-02': 'https://youtu.be/0xT6JBNv1zQ',
  'ADV-03': 'https://youtu.be/eWAAFVw9Hs0',
  'ADV-04': 'https://youtu.be/UKWhdf4GwO8',
}

function pinnedBlock(task) {
  const all = [...String(task).matchAll(/Block:\s*(\d+)/gi)].map((m) => m[1])
  const uniq = [...new Set(all)]
  return uniq.length === 1 ? uniq[0] : null
}

async function archiveCanRead(blockDec) {
  if (!ARCHIVE) return { ok: false, reason: 'no BSC_ARCHIVE_RPC_URL configured' }
  const hex = '0x' + BigInt(blockDec).toString(16)
  try {
    const r = await fetch(ARCHIVE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_getCode',
        params: ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', hex],
      }),
      signal: AbortSignal.timeout(20_000),
    }).then((x) => x.json())
    if (r.result && r.result !== '0x') return { ok: true, reason: `WBNB code ${r.result.length} bytes at ${blockDec}` }
    return { ok: false, reason: JSON.stringify(r.error ?? r.result) }
  } catch (e) {
    return { ok: false, reason: String(e) }
  }
}

const benches = await sql`select id, task, task_hash, input_hash, rubric_hash from benchmark ${ONLY ? sql`where id = ${ONLY}` : sql``} order by id`
let wrote = 0

for (const b of benches) {
  console.log('\n' + '='.repeat(72))
  console.log(`${b.id}`)
  const pinned = pinnedBlock(b.task)
  console.log(`  frozen task hash : ${b.task_hash}`)
  console.log(`  pinned block     : ${pinned ?? '(none / ambiguous — NOT recoverable)'}`)

  const manual = await sql`
    select id, rep, batch, block_number, evidence_url, note, manifest
    from benchmark_run
    where benchmark_id = ${b.id} and arm = 'manual'
    order by rep, id`
  const latestBatch = manual.length
    ? manual.reduce((best, r) => (Number(r.id) > Number(best.id) ? r : best), manual[0]).batch
    : null
  const sitting = manual.filter((r) => r.batch === latestBatch)

  const reps = new Set(sitting.map((r) => r.rep))
  const hashesMatch = sitting.every((r) => (r.manifest?.task_hash ?? null) === b.task_hash)
  const allSameTask = new Set(sitting.map((r) => r.manifest?.task_hash ?? 'none')).size === 1
  const needBlockFix = sitting.filter((r) => !/^[1-9]\d*$/.test(String(r.block_number)))

  console.log(`  manual sitting   : batch ${latestBatch}, reps ${[...reps].sort().join('+')}`)
  console.log(`  hashes vs frozen : ${hashesMatch ? 'all match ✓' : 'MISMATCH ✗'}${allSameTask ? '' : ' (reps disagree ✗)'}`)
  console.log(`  block-0 reps     : ${needBlockFix.map((r) => `rep${r.rep}#${r.id}`).join(', ') || '(none)'}`)

  const arch = pinned ? await archiveCanRead(pinned) : { ok: false, reason: 'no pinned block' }
  console.log(`  archive @ block  : ${arch.ok ? 'OK — ' + arch.reason : 'unavailable — ' + arch.reason}`)

  const eligible = Boolean(pinned) && hashesMatch && allSameTask && reps.size === 2
  console.log(`  provenance repair: ${eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`)
  if (!eligible) {
    console.log(`  reason           : ${!pinned ? 'task does not pin exactly one block' : !hashesMatch ? 'a manual run answered a different task than the registered one' : !allSameTask ? 'the two manual reps answered different tasks' : 'the manual sitting does not have exactly two repetitions'}`)
    continue
  }

  for (const r of needBlockFix) {
    let existing = []
    try {
      existing = await sql`select id from benchmark_run_provenance where run_id = ${r.id} and field = 'block_number'`
    } catch (e) {
      if (String(e).includes('does not exist')) {
        if (APPLY) { console.error('  benchmark_run_provenance table is missing — run the migration first'); process.exit(1) }
        console.log('  (provenance table not migrated yet — dry run continues)')
      } else throw e
    }
    if (existing.length) { console.log(`  rep${r.rep}#${r.id}: provenance already recorded — skip`); continue }
    const reasonText = `The raw run recorded no block. Its manifest task hash (${b.task_hash}) matches the benchmark task frozen before either arm ran, and that task pins exactly one BSC block: ${pinned}. The raw row is unchanged; this is the block trusted for the comparison.`
    if (APPLY) {
      await sql`
        insert into benchmark_run_provenance
          (run_id, field, original_value, effective_value, reason_code, reason, source_task_hash, source_evidence_url, repair_version)
        values
          (${r.id}, 'block_number', ${String(r.block_number)}, ${pinned}, 'recovered_from_frozen_task',
           ${reasonText}, ${b.task_hash}, ${RECORDINGS[b.id] ?? null}, ${REPAIR_VERSION})`
      wrote++
      console.log(`  rep${r.rep}#${r.id}: WROTE provenance — effective block ${pinned}`)
    } else {
      console.log(`  rep${r.rep}#${r.id}: would write provenance — effective block ${pinned} (source ${b.task_hash})`)
    }
  }

  // Back-fill the sitting's screen recording onto any rep that lacks it.
  const rec = RECORDINGS[b.id]
  if (rec) {
    for (const r of sitting.filter((x) => !x.evidence_url)) {
      if (APPLY) {
        await sql`update benchmark_run set evidence_url = ${rec} where id = ${r.id} and evidence_url is null`
        console.log(`  rep${r.rep}#${r.id}: attached recording ${rec}`)
      } else {
        console.log(`  rep${r.rep}#${r.id}: would attach recording ${rec}`)
      }
    }
  }
}

console.log('\n' + '='.repeat(72))
console.log(APPLY ? `applied — ${wrote} provenance row(s) written` : 'dry run — nothing written. Re-run with --apply.')
await sql.end()
