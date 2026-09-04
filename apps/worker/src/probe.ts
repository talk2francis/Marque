/**
 * The probe worker. One PM2 process, a cycle every 5 minutes.
 *
 * Every outbound request goes through safeFetch, so this process cannot be
 * turned into an SSRF proxy by a hostile registry entry.
 */
import { runProbeCycle } from '@marque/probe'
import { closeDb } from '@marque/db'

const ONCE = process.argv.includes('--once')
const CYCLE_MS = Number(process.env.PROBE_CYCLE_MS ?? 5 * 60_000)
const LIMIT = Number(process.env.PROBE_LIMIT ?? 500)
const CONCURRENCY = Number(process.env.PROBE_CONCURRENCY ?? 12)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { stopping = true })
}

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'probe', event, ...data }))
}

async function main(): Promise<void> {
  log('start', { once: ONCE, limit: LIMIT, concurrency: CONCURRENCY })
  do {
    try {
      const r = await runProbeCycle({ limit: LIMIT, concurrency: CONCURRENCY })
      log('cycle', { ...r })
    } catch (err) {
      log('cycle_error', { error: err instanceof Error ? err.message : String(err) })
      if (ONCE) throw err
      await sleep(15_000)
    }
    if (!ONCE && !stopping) await sleep(CYCLE_MS)
  } while (!ONCE && !stopping)
  await closeDb()
  log('stop', {})
}

main().catch((err) => { console.error(err); process.exit(1) })
