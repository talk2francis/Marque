/**
 * The ingest worker.
 *
 * One long-lived process under PM2. Each tick does a bounded amount of work and
 * then sleeps, so the process yields regularly, respects the API budget, and
 * never loses more than one page of progress to a restart.
 *
 * Run once and exit:  pnpm --filter @marque/worker ingest:once
 */
import { ScanClient, sweepList, enrichDetails, snapshotFunnel, BSC } from '@marque/registry'
import { closeDb } from '@marque/db'

const ONCE = process.argv.includes('--once')

/** Pages of 100 agents per tick during the list sweep. */
const SWEEP_PAGES = Number(process.env.INGEST_SWEEP_PAGES ?? 200)
/** Detail records per tick. Each is one request, so this is the expensive dial. */
const ENRICH_LIMIT = Number(process.env.INGEST_ENRICH_LIMIT ?? 600)
/** Idle time between ticks. */
const TICK_MS = Number(process.env.INGEST_TICK_MS ?? 5_000)
/** Funnel snapshots are cheap but there is no point taking one every tick. */
const FUNNEL_EVERY_MS = Number(process.env.INGEST_FUNNEL_MS ?? 30 * 60_000)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[ingest] ${sig} received, finishing current tick`)
    stopping = true
  })
}

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'ingest', event, ...data }))
}

async function tick(client: ScanClient, state: { lastFunnelAt: number }): Promise<void> {
  const sweep = await sweepList({ client, chainId: BSC, maxPages: SWEEP_PAGES })
  log('sweep', {
    pages: sweep.pagesFetched,
    seen: sweep.agentsSeen,
    upserted: sweep.agentsUpserted,
    droppedOffChain: sweep.droppedOffChain,
    reportedTotal: sweep.reportedTotal,
    stopped: sweep.stoppedBecause,
    budgetMinute: client.rateLimit.remainingMinute,
    budgetDay: client.rateLimit.remainingDay,
  })

  const enrich = await enrichDetails({ client, chainId: BSC, limit: ENRICH_LIMIT })
  log('enrich', {
    attempted: enrich.attempted,
    ok: enrich.succeeded,
    failed: enrich.failed,
    services: enrich.servicesWritten,
    withService: enrich.withAtLeastOneService,
  })

  if (Date.now() - state.lastFunnelAt > FUNNEL_EVERY_MS) {
    const stages = await snapshotFunnel({ client, chainId: BSC })
    state.lastFunnelAt = Date.now()
    log('funnel', Object.fromEntries(stages.map((s) => [s.stage, s.count])))
  }
}

async function main(): Promise<void> {
  const client = new ScanClient()
  const state = { lastFunnelAt: 0 }
  log('start', { once: ONCE, sweepPages: SWEEP_PAGES, enrichLimit: ENRICH_LIMIT })

  do {
    try {
      await tick(client, state)
    } catch (err) {
      // A tick failing is normal against a third-party API. Log it and carry on;
      // the cursor means we resume exactly where we stopped.
      log('tick_error', { error: err instanceof Error ? err.message : String(err) })
      if (ONCE) throw err
      await sleep(10_000)
    }
    if (!ONCE && !stopping) await sleep(TICK_MS)
  } while (!ONCE && !stopping)

  await closeDb()
  log('stop', {})
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
