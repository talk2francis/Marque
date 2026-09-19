/**
 * The ingest worker.
 *
 * One long-lived process under PM2. Each tick does a bounded amount of work and
 * then sleeps, so the process yields regularly, respects the API budget, and
 * never loses more than one page of progress to a restart.
 *
 * Run once and exit:  pnpm --filter @marque/worker ingest:once
 */
import { ScanClient, sweepList, sweepListDeep, sweepChainIdentities, enrichDetails, snapshotFunnel, BSC } from '@marque/registry'
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
/** Minimum gap between full 0..MAX_OFFSET list sweeps (each is ~100 API calls). */
const SWEEP_COOLDOWN_MS = Number(process.env.INGEST_SWEEP_COOLDOWN_MS ?? 5 * 60_000)
/**
 * The deep pass walks the whole list by cursor, which the offset ceiling makes
 * unreachable. It is the slow, patient one: a slice per interval, idempotent,
 * so it closes the tail without competing with the head sweep for API budget.
 */
const DEEP_COOLDOWN_MS = Number(process.env.INGEST_DEEP_COOLDOWN_MS ?? 90_000)
const DEEP_PAGES = Number(process.env.INGEST_DEEP_PAGES ?? 40)
const DEEP_ENABLED = process.env.INGEST_DEEP_DISABLED !== '1'
/**
 * The chain pass. 8004scan lists ~322k of the ~354k identities actually minted
 * on BSC, so the registry count can only be right if it is read from the chain.
 * This walks the token id space over pooled dataseed RPC — our own endpoints,
 * not the metered aggregator — so it is cheap to run continuously.
 */
const CHAIN_COOLDOWN_MS = Number(process.env.INGEST_CHAIN_COOLDOWN_MS ?? 60_000)
const CHAIN_MAX_IDS = Number(process.env.INGEST_CHAIN_MAX_IDS ?? 5_000)
const CHAIN_ENABLED = process.env.INGEST_CHAIN_DISABLED !== '1'

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

/**
 * One tick: sweep, then enrich, then occasionally snapshot the funnel.
 *
 * Each stage is independently guarded. A sweep failure previously aborted the
 * whole tick, so a single slow page at a deep offset starved enrichment for an
 * hour — the sweep is the fragile stage and the enrich is the valuable one.
 */
async function tick(client: ScanClient, state: { lastFunnelAt: number; lastFullSweepAt: number; lastDeepAt: number; lastChainAt: number }): Promise<void> {
  // The reachable list is a ~10k window swept whole in one pass (~100 calls).
  // Doing that every tick would blow the daily API budget, and new agents only
  // trickle in — so a full window sweep runs at most once per cooldown.
  if (Date.now() - state.lastFullSweepAt >= SWEEP_COOLDOWN_MS) {
    try {
      const wrapped = await sweepStage(client)
      if (wrapped) state.lastFullSweepAt = Date.now()
    } catch (err) {
      log('sweep_error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  // The deep backfill. Separate cursor, separate cooldown, never blocks enrich.
  if (DEEP_ENABLED && Date.now() - state.lastDeepAt >= DEEP_COOLDOWN_MS) {
    state.lastDeepAt = Date.now()
    try {
      const deep = await sweepListDeep({ client, chainId: BSC, maxPages: DEEP_PAGES })
      log('deep_sweep', {
        pages: deep.pagesFetched,
        seen: deep.agentsSeen,
        upserted: deep.agentsUpserted,
        walked: deep.walked,
        reportedTotal: deep.reportedTotal,
        completedPass: deep.completedPass,
      })
    } catch (err) {
      log('deep_sweep_error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  // The chain pass. Independent cursor, own cooldown, RPC not API budget.
  if (CHAIN_ENABLED && Date.now() - state.lastChainAt >= CHAIN_COOLDOWN_MS) {
    state.lastChainAt = Date.now()
    try {
      const chain = await sweepChainIdentities({ chainId: BSC, maxIds: CHAIN_MAX_IDS })
      log('chain_sweep', {
        scanned: chain.scanned,
        existing: chain.existing,
        inserted: chain.inserted,
        cursor: chain.cursor,
        highestId: chain.highestId,
        completedPass: chain.completedPass,
      })
    } catch (err) {
      log('chain_sweep_error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  try {
    const enrich = await enrichDetails({ client, chainId: BSC, limit: ENRICH_LIMIT })
    log('enrich', {
      attempted: enrich.attempted,
      ok: enrich.succeeded,
      failed: enrich.failed,
      transient: enrich.transient,
      services: enrich.servicesWritten,
      withService: enrich.withAtLeastOneService,
    })
  } catch (err) {
    log('enrich_error', { error: err instanceof Error ? err.message : String(err) })
  }

  if (Date.now() - state.lastFunnelAt > FUNNEL_EVERY_MS) {
    try {
      const stages = await snapshotFunnel({ client, chainId: BSC })
      state.lastFunnelAt = Date.now()
      log('funnel', Object.fromEntries(stages.map((s) => [s.stage, s.count])))
    } catch (err) {
      log('funnel_error', { error: err instanceof Error ? err.message : String(err) })
    }
  }
}

/** Returns true when the sweep completed a full pass of the reachable window. */
async function sweepStage(client: ScanClient): Promise<boolean> {
  // 8004scan's paginated list is degraded past a shallow offset, but the total
  // on the first page is reliable — take it directly so the registry's own
  // headline figure is always current even when a deep sweep returns nothing.
  const registryTotal = await client.countAgents(BSC).catch(() => null)
  const sweep = await sweepList({ client, chainId: BSC, maxPages: SWEEP_PAGES, registryTotal })
  log('sweep', {
    pages: sweep.pagesFetched,
    seen: sweep.agentsSeen,
    upserted: sweep.agentsUpserted,
    droppedOffChain: sweep.droppedOffChain,
    reportedTotal: sweep.reportedTotal ?? registryTotal,
    stopped: sweep.stoppedBecause,
    budgetMinute: client.rateLimit.remainingMinute,
    budgetDay: client.rateLimit.remainingDay,
  })
  return sweep.stoppedBecause === 'exhausted' || sweep.stoppedBecause === 'empty_page'
}

async function main(): Promise<void> {
  const client = new ScanClient()
  const state = { lastFunnelAt: 0, lastFullSweepAt: 0, lastDeepAt: 0, lastChainAt: 0 }
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
