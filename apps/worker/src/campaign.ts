/**
 * The Set and Earn campaign worker (V4-03, SPEC-ADOPTION 2.3 and 5).
 *
 * 1. Reads every ERC-8183 job created in the window on chains 56 and 97 into campaign_job
 *    (derived state): new ids and every job that can still change each minute, a full
 *    re-read of all window jobs every 6 hours.
 * 2. When MARQUE_TELEGRAM_BOT_TOKEN is set and QUEST_BOT_DISABLED is not, answers
 *    @MarqueTradeBot (/start, /watch, /status, /stop) and sends the deadline reminders and
 *    job events to chats that asked for them. A chat's rows are deleted on /stop.
 *
 * It never signs, never sends a transaction and never moves funds.
 */
import { indexAllCampaignJobs } from '@marque/commerce'
import { closeDb } from '@marque/db'
import { startQuestBot } from './quest-bot.js'

const ONCE = process.argv.includes('--once')
const FULL = process.argv.includes('--full')
const TICK_MS = Number(process.env.CAMPAIGN_TICK_MS ?? 60_000)
const FULL_EVERY_MS = 6 * 3600_000
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'campaign', event, ...data }))
}

async function main(): Promise<void> {
  log('start', { once: ONCE, tickMs: TICK_MS })
  const bot = ONCE ? null : startQuestBot(log, () => stopping)
  let lastFull = 0
  do {
    const started = Date.now()
    const full = FULL || Date.now() - lastFull > FULL_EVERY_MS
    try {
      const r = await indexAllCampaignJobs({ full })
      if (full) lastFull = Date.now()
      log('pass', { full, ...r, ms: Date.now() - started })
    } catch (err) {
      log('pass_error', { error: err instanceof Error ? err.message : String(err) })
      if (ONCE) throw err
    }
    if (!ONCE && !stopping) await sleep(TICK_MS)
  } while (!ONCE && !stopping)
  await bot?.stop()
  await closeDb()
  log('stop', {})
}

main().catch((err) => { console.error(err); process.exit(1) })
