/**
 * The quote worker (P2-01). Asks every ERC-8183 seller for a signed price on a schedule
 * and stores the answer as a first-party observation. It never creates a job, never
 * signs anything and never moves funds: a quote is free and binds nobody until a
 * buyer's own wallet anchors it on chain.
 *
 * Cadence: first-party sellers every 10 min, hireable third parties every 30 min,
 * everyone else every 6 h. Every outbound call goes through safeFetch.
 */
import { runQuoteProbe, syncFirstPartyCategories, retryPendingNotifies } from '@marque/commerce'
import { closeDb } from '@marque/db'

const ONCE = process.argv.includes('--once')
const TICK_MS = Number(process.env.QUOTE_TICK_MS ?? 60_000)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'quotes', event, ...data }))
}

async function main(): Promise<void> {
  log('start', { once: ONCE, tickMs: TICK_MS })
  try { log('first_party_categories', { inserted: await syncFirstPartyCategories() }) } catch (err) {
    log('first_party_categories_error', { error: err instanceof Error ? err.message : String(err) })
  }
  do {
    const started = Date.now()
    try {
      const r = await runQuoteProbe({ concurrency: 4 })
      if (r.attempted) log('pass', { ...r, ms: Date.now() - started })
      const n = await retryPendingNotifies()
      if (n.checked) log('notify_retry', n)
    } catch (err) {
      log('pass_error', { error: err instanceof Error ? err.message : String(err) })
      if (ONCE) throw err
    }
    if (!ONCE && !stopping) await sleep(TICK_MS)
  } while (!ONCE && !stopping)
  await closeDb()
  log('stop', {})
}

main().catch((err) => { console.error(err); process.exit(1) })
