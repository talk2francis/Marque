/** The classifier worker. Deterministic pass, then an optional semantic pass. */
import { classifyKeywordPass, classifySemanticPass } from '@marque/registry'
import { closeDb } from '@marque/db'

const ONCE = process.argv.includes('--once')
const SEMANTIC = process.argv.includes('--semantic')
const CYCLE_MS = Number(process.env.CLASSIFY_CYCLE_MS ?? 10 * 60_000)
const LIMIT = Number(process.env.CLASSIFY_LIMIT ?? 5000)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'classify', event, ...data }))
}

async function main(): Promise<void> {
  log('start', { once: ONCE, semantic: SEMANTIC, limit: LIMIT })

  // One-shot semantic pass: the deterministic pass has already run to
  // exhaustion, so `classify --once --semantic` is the way to lift the last
  // cliff (P10.5C item 2). Cost is capped at DAILY_LLM_USD_CAP.
  if (SEMANTIC) {
    const r = await classifySemanticPass({ limit: LIMIT })
    log('semantic_pass', { ...r })
    await closeDb()
    log('stop', {})
    return
  }

  do {
    try {
      const r = await classifyKeywordPass(LIMIT)
      log('pass', { ...r })
      if (r.examined === 0 && !ONCE) await sleep(CYCLE_MS)
    } catch (err) {
      log('pass_error', { error: err instanceof Error ? err.message : String(err) })
      if (ONCE) throw err
      await sleep(15_000)
    }
    if (!ONCE && !stopping) await sleep(5_000)
  } while (!ONCE && !stopping)
  await closeDb()
  log('stop', {})
}

main().catch((err) => { console.error(err); process.exit(1) })
