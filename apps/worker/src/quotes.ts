/**
 * The quote worker (P2-01). Asks every ERC-8183 seller for a signed price on a schedule
 * and stores the answer as a first-party observation. It never creates a job, never
 * signs anything and never moves funds: a quote is free and binds nobody until a
 * buyer's own wallet anchors it on chain.
 *
 * Healthy cadence is capped at 10 min for reference sellers and 30 min for
 * third parties, brought forward before observed quote expiry. Failed attempts
 * retry after 1 min for reference sellers and 6 h for third parties. Every outbound call goes through safeFetch.
 */
import { runQuoteProbe, syncFirstPartyCategories, retryPendingNotifies, unpricedAlarms } from '@marque/commerce'
import { closeDb } from '@marque/db'

const ONCE = process.argv.includes('--once')
const TICK_MS = Number(process.env.QUOTE_TICK_MS ?? 60_000)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })

/**
 * The 2-hour unpriced alarm (SPEC-SUPPLY 3): a seller that priced in the last day and has not for
 * 2 hours is reported once per 12 hours, to the log and to the ops chat when one is configured.
 */
const alerted = new Map<string, number>()
let lastAlarmCheck = 0
async function checkUnpriced(): Promise<void> {
  if (Date.now() - lastAlarmCheck < 10 * 60_000) return
  lastAlarmCheck = Date.now()
  const fresh = (await unpricedAlarms()).filter((a) => Date.now() - (alerted.get(a.agentId) ?? 0) > 12 * 3_600_000)
  if (!fresh.length) return
  for (const a of fresh) alerted.set(a.agentId, Date.now())
  log('unpriced_alarm', { agents: fresh.map((a) => ({ id: a.agentId, name: a.name, lastOkAt: a.lastOkAt })) })
  const token = process.env.MARQUE_TELEGRAM_BOT_TOKEN, chat = process.env.MARQUE_TELEGRAM_CHAT_ID
  if (!token || !chat) return
  const text = `Unpriced for 2 hours (priced in the last day):\n${fresh.slice(0, 12).map((a) => `- ${a.name ?? a.agentId} (last price ${a.lastOkAt.slice(11, 16)} UTC)`).join('\n')}`
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) }).catch(() => undefined)
}

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
      await checkUnpriced().catch((err) => log('alarm_error', { error: err instanceof Error ? err.message : String(err) }))
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
