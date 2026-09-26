/**
 * The Quest Index worker (P2-03, SPEC-TRACKING 3). Every 6 s, per chain: read the hire
 * contracts' logs from the cursor to head minus 3 confirmations (re-reading the last 50
 * blocks), store them, recompute touched jobs, auto-bind Marque intents, fold in ratings.
 * It only reads the chain; it never signs.
 */
import { indexChain, relinkIntents, SUPPORTED_CHAINS, type ChainId } from '@marque/commerce'
import { closeDb } from '@marque/db'

const ONCE = process.argv.includes('--once')
const TICK_MS = Number(process.env.INDEXER_TICK_MS ?? 6_000)
const CHAINS = (process.env.INDEXER_CHAINS ?? SUPPORTED_CHAINS.join(',')).split(',').map(Number) as ChainId[]
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'indexer', event, ...data }))
}

async function main(): Promise<void> {
  log('start', { once: ONCE, tickMs: TICK_MS, chains: CHAINS })
  let quiet = 0
  do {
    for (const chainId of CHAINS) {
      if (stopping) break
      try {
        const r = await indexChain(chainId)
        // Log anything that happened, and a heartbeat every ~5 min otherwise.
        if (r.stored || r.bound || ++quiet % 50 === 0) log('pass', { ...r, lag: r.head - r.to })
      } catch (err) {
        log('pass_error', { chainId, error: err instanceof Error ? err.message.slice(0, 300) : String(err) })
        if (ONCE) throw err
      }
    }
    try { const n = await relinkIntents(); if (n) log('relinked', { n }) } catch { /* next tick */ }
    if (!ONCE && !stopping) await sleep(TICK_MS)
  } while (!ONCE && !stopping)
  await closeDb()
  log('stop', {})
}

main().catch((err) => { console.error(err); process.exit(1) })
