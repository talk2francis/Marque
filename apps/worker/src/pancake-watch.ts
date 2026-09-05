/**
 * The pool watcher. One PM2 process, a reading every 2 minutes.
 *
 * It exists because "hours out of range" has no public source on BSC
 * (docs/FINDINGS.md F-06). Every row it writes is a first-party observation
 * that cannot be recreated, so this worker never deletes and never backfills.
 *
 * A missed cycle leaves a GAP in the series, and a gap is visible in the data
 * rather than smoothed over: the measurement reports how many observations it
 * rests on, so a sparse series cannot masquerade as a dense one.
 */
import { eq, sql } from 'drizzle-orm'
import { db, poolTickObservation, poolWatch, closeDb } from '@marque/db'
import { readTicks } from '@marque/positions'
import type { Address } from 'viem'

const ONCE = process.argv.includes('--once')
const CYCLE_MS = Number(process.env.WATCH_CYCLE_MS ?? 2 * 60_000)
/** Observations older than this are pruned ONLY if the row count explodes;
 *  see the note below — by default nothing is ever removed. */
const RETAIN_DAYS = Number(process.env.WATCH_RETAIN_DAYS ?? 0)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { stopping = true })
}

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'pancake-watch', event, ...data }))
}

async function cycle(): Promise<void> {
  const watched = await db().select().from(poolWatch)
  if (watched.length === 0) { log('idle', { reason: 'no pool is being watched yet' }); return }

  const readings = await readTicks(watched.map((w) => w.pool as Address))
  if (readings.length > 0) {
    await db().insert(poolTickObservation).values(
      readings.map((r) => ({
        pool: r.pool.toLowerCase(),
        tick: r.tick,
        blockNumber: r.blockNumber,
        observedAt: r.observedAt,
      })),
    )
    for (const r of readings) {
      await db().update(poolWatch)
        .set({ lastObservedAt: r.observedAt })
        .where(eq(poolWatch.pool, r.pool.toLowerCase()))
    }
  }
  log('cycle', { watched: watched.length, observed: readings.length, unreadable: watched.length - readings.length })

  // Retention is OFF by default. These are observations we cannot recreate,
  // and invariant 12 forbids dropping them; the switch exists only so a
  // runaway table can be bounded deliberately, never as a routine tidy-up.
  if (RETAIN_DAYS > 0) {
    const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000)
    const gone = await db().delete(poolTickObservation)
      .where(sql`${poolTickObservation.observedAt} < ${cutoff}`)
    log('pruned', { retainDays: RETAIN_DAYS, cutoff: cutoff.toISOString(), gone: String(gone) })
  }
}

async function main(): Promise<void> {
  log('start', { once: ONCE, cycleMs: CYCLE_MS })
  do {
    try {
      await cycle()
    } catch (err) {
      log('error', { message: err instanceof Error ? err.message : String(err) })
    }
    if (ONCE || stopping) break
    await sleep(CYCLE_MS)
  } while (!stopping)
  await closeDb()
  log('stop', {})
}

void main()
