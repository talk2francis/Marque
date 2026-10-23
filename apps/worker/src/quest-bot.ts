import { sql } from 'drizzle-orm'
import { db, questWatch } from '@marque/db'
import { questFor, CAMPAIGN, campaignEndMs, isAddress, teamWallets } from '@marque/commerce'

/**
 * @MarqueTradeBot, the quest companion on Telegram (SPEC-ADOPTION 5, rung 1c).
 *
 * Data kept: chat id and the address it watches, plus which messages were already sent so a
 * restart never repeats one. /stop deletes the chat's rows. Long polling (no webhook), so it
 * needs no public route. The same token sends Marque's ops alerts by sendMessage only, which
 * never reads updates, so the two do not compete.
 */

type Log = (event: string, data: Record<string, unknown>) => void
const BASE = process.env.MARQUE_PUBLIC_URL || 'https://marque.trade'
const MAX_PER_CHAT = 3
const MAX_WATCHES = 2000
const PROGRESS_EVERY_MS = 10 * 60_000

/** Reminder marks before the close (same marks as the calendar file). */
export const REMINDERS: Array<{ key: string; beforeMs: number; text: string }> = [
  { key: 'r7d', beforeMs: 7 * 86_400_000, text: 'Set and Earn closes in 7 days, on Thu 5 Nov at 12:00 UTC.' },
  { key: 'r2d', beforeMs: 2 * 86_400_000, text: 'Set and Earn closes in 2 days, on Thu 5 Nov at 12:00 UTC.' },
  { key: 'r1d', beforeMs: 86_400_000, text: 'Set and Earn closes in 24 hours, at 12:00 UTC tomorrow.' },
  { key: 'r3h', beforeMs: 3 * 3_600_000, text: 'Set and Earn closes in 3 hours, at 12:00 UTC.' },
]

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function progressLines(q: Awaited<ReturnType<typeof questFor>>): string {
  const lines: string[] = [`Set and Earn for ${short(q.address)}`]
  if (q.excluded.team) lines.push('Team wallet: shown, never counted.')
  const mk = q.hire.marketplaces
  lines.push(`Hire: ${q.hire.distinctAgents} of ${CAMPAIGN.required.agents} different agents, on ${mk.named.length} named marketplace${mk.named.length === 1 ? '' : 's'}${mk.notRecorded ? ` (+${mk.notRecorded} not recorded)` : ''}.`)
  const b = q.build.agents[0]
  lines.push(b ? `Build: ${b.name ?? `#${b.tokenId}`}, ${b.observed} of 6 criteria observed on chain.` : 'Build: no ERC-8004 agent owned by this wallet yet.')
  const n = q.next[0]
  if (n) lines.push(`Next: ${n.label}.`)
  lines.push(`${BASE}/quest/${q.address}`)
  return lines.join('\n')
}

export function startQuestBot(log: Log, stopping: () => boolean): { stop: () => Promise<void> } | null {
  const token = process.env.MARQUE_TELEGRAM_BOT_TOKEN?.trim()
  if (!token || process.env.QUEST_BOT_DISABLED === '1') { log('bot_off', { reason: token ? 'disabled' : 'no token' }); return null }
  const api = async (method: string, body: Record<string, unknown>, timeoutMs = 40_000): Promise<Record<string, unknown> | null> => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal })
      const j = await r.json() as { ok: boolean; result?: unknown; description?: string }
      if (!j.ok) { log('bot_api_error', { method, detail: (j.description ?? '').slice(0, 120) }); return null }
      return { result: j.result }
    } catch (e) {
      if (!stopping()) log('bot_api_error', { method, detail: e instanceof Error ? e.name : 'error' })
      return null
    } finally { clearTimeout(t) }
  }
  const send = (chatId: string, text: string) => api('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true }, 15_000)

  const watch = async (chatId: string, raw: string): Promise<string> => {
    const address = raw.trim()
    if (!isAddress(address)) return 'Send /watch followed by a wallet address, for example /watch 0x0d8c…E999 written in full.'
    const lower = address.toLowerCase()
    const mine = await db().execute(sql`select address from quest_watch where chat_id = ${chatId}`) as unknown as Array<{ address: string }>
    if (!mine.some((m) => m.address === lower) && mine.length >= MAX_PER_CHAT) return `This chat already follows ${MAX_PER_CHAT} wallets. Send /stop to clear them first.`
    const [count] = await db().execute(sql`select count(*)::int as n from quest_watch`) as unknown as Array<{ n: number }>
    if ((count?.n ?? 0) >= MAX_WATCHES) return 'The reminder list is full right now. The page shows the same progress: ' + `${BASE}/quest/${address}`
    await db().insert(questWatch).values({ chatId, address: lower }).onConflictDoNothing()
    try {
      const q = await questFor(address)
      await db().execute(sql`update quest_watch set last_state = ${JSON.stringify(stateOf(q))}::jsonb where chat_id = ${chatId} and address = ${lower}`)
      return `Following ${short(address)}. You will get the deadline reminders and a message when a hire is delivered or a build check turns green.\n\n${progressLines(q)}\n\nSend /stop to stop and delete this.`
    } catch {
      return `Following ${short(address)}. Progress could not be read just now; it will follow shortly. Send /stop to stop.`
    }
  }

  const handle = async (chatId: string, text: string) => {
    const [cmd, ...rest] = text.trim().split(/\s+/)
    const arg = rest.join(' ')
    switch ((cmd ?? '').toLowerCase().replace(/@.*$/, '')) {
      case '/start':
        if (arg && isAddress(arg)) return send(chatId, await watch(chatId, arg))
        return send(chatId, `Marque follows Set and Earn for you: the deadline (Thu 5 Nov, 12:00 UTC) and your hire and build progress, read from BNB Chain.\n\n/watch 0x… follow a wallet (no signature, nothing is sent)\n/status show progress now\n/stop stop and delete what this chat follows\n\nThe same progress is on ${BASE}/quest`)
      case '/watch':
        return send(chatId, await watch(chatId, arg))
      case '/status': {
        const rows = await db().execute(sql`select address from quest_watch where chat_id = ${chatId}`) as unknown as Array<{ address: string }>
        if (!rows.length) return send(chatId, 'This chat follows no wallet yet. Send /watch 0x…')
        for (const r of rows) {
          try { await send(chatId, progressLines(await questFor(r.address))) } catch { await send(chatId, `Progress for ${short(r.address)} could not be read just now.`) }
        }
        return
      }
      case '/stop': {
        await db().execute(sql`delete from quest_watch where chat_id = ${chatId}`)
        return send(chatId, 'Stopped. This chat and the wallets it followed are deleted from Marque.')
      }
      default:
        return send(chatId, 'Send /watch 0x… to follow a wallet, /status for progress, or /stop.')
    }
  }

  let offset = 0
  let running = true
  const poll = (async () => {
    while (running && !stopping()) {
      const r = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] })
      const updates = (r?.result ?? []) as Array<{ update_id: number; message?: { chat?: { id: number; type?: string }; text?: string } }>
      if (!r) { await new Promise((res) => setTimeout(res, 5_000)); continue }
      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1)
        const chat = u.message?.chat
        const text = u.message?.text
        if (!chat || !text || chat.type !== 'private') continue
        try { await handle(String(chat.id), text.slice(0, 200)) } catch (e) { log('bot_handle_error', { error: e instanceof Error ? e.message.slice(0, 120) : 'error' }) }
      }
    }
  })()

  /** Reminders and progress events, once a minute; progress is re-read every 10 minutes per watch. */
  let lastProgress = 0
  const tick = setInterval(() => { void (async () => {
    try {
      const now = Date.now()
      const watches = await db().execute(sql`select chat_id, address, last_state, sent from quest_watch`) as unknown as Array<{ chat_id: string; address: string; last_state: State | null; sent: string[] }>
      const due = REMINDERS.filter((m) => now >= campaignEndMs - m.beforeMs && now < campaignEndMs - m.beforeMs + 6 * 3_600_000)
      const closed = now >= campaignEndMs && now < campaignEndMs + 86_400_000
      const readProgress = now - lastProgress > PROGRESS_EVERY_MS
      if (readProgress) lastProgress = now
      for (const w of watches) {
        const sent = new Set(w.sent ?? [])
        const out: Array<{ key: string; text: string }> = []
        for (const m of due) if (!sent.has(m.key)) out.push({ key: m.key, text: `${m.text}\n${BASE}/quest/${w.address}` })
        if (closed && !sent.has('closed')) out.push({ key: 'closed', text: `Set and Earn closed at 12:00 UTC. BNB Chain verifies and announces winners after ${CAMPAIGN.winnersAfter.slice(8)} November. Your progress stays readable: ${BASE}/quest/${w.address}` })
        let state = w.last_state
        if (readProgress && now < campaignEndMs + 86_400_000) {
          try {
            const q = await questFor(w.address)
            const next = stateOf(q)
            if (state) for (const e of eventsBetween(state, next, teamWallets().includes(w.address))) if (!sent.has(e.key)) out.push(e)
            state = next
          } catch { /* next tick */ }
        }
        for (const m of out) { await send(w.chat_id, m.text); sent.add(m.key) }
        if (out.length || state !== w.last_state) {
          await db().execute(sql`update quest_watch set sent = ${JSON.stringify([...sent].slice(-200))}::jsonb, last_state = ${JSON.stringify(state)}::jsonb where chat_id = ${w.chat_id} and address = ${w.address}`)
        }
      }
    } catch (e) { log('bot_tick_error', { error: e instanceof Error ? e.message.slice(0, 160) : 'error' }) }
  })() }, 60_000)

  log('bot_on', {})
  return { stop: async () => { running = false; clearInterval(tick); await Promise.race([poll, new Promise((r) => setTimeout(r, 2_000))]) } }
}

interface State { delivered: string[]; distinct: number; hireStatus: string; build: Record<string, { observed: number; independent: number }> }

export function stateOf(q: Awaited<ReturnType<typeof questFor>>): State {
  return {
    delivered: q.hire.hires.filter((h) => ['SUBMITTED', 'COMPLETED'].includes(h.status)).map((h) => `${h.chainId}:${h.jobId}`),
    distinct: q.hire.distinctAgents,
    hireStatus: q.hire.status,
    build: Object.fromEntries(q.build.agents.map((a) => [`${a.chainId}:${a.tokenId}`, { observed: a.observed, independent: Number((a.checks['hires'] as { independent?: number } | undefined)?.independent ?? 0) }])),
  }
}

export function eventsBetween(prev: State, next: State, team: boolean): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = []
  for (const j of next.delivered) if (!prev.delivered.includes(j)) out.push({ key: `job:${j}`, text: `Job #${j.split(':')[1]} on ${j.startsWith('97:') ? 'BSC testnet' : 'BSC mainnet'} was delivered.` })
  if (next.distinct > prev.distinct) out.push({ key: `distinct:${next.distinct}`, text: `${next.distinct} of ${CAMPAIGN.required.agents} different agents hired, seen on chain.` })
  if (!team && next.hireStatus === 'met' && prev.hireStatus !== 'met') out.push({ key: 'hire:met', text: 'Hire track: 3 different agents across 2 marketplaces, seen on chain. BNB Chain decides eligibility.' })
  for (const [k, b] of Object.entries(next.build)) {
    const p = prev.build[k]
    if (p && b.independent > p.independent) out.push({ key: `indep:${k}:${b.independent}`, text: `Your agent #${k.split(':')[1]} got its ${ordinal(b.independent)} independent hire.` })
    if (p && b.observed > p.observed) out.push({ key: `build:${k}:${b.observed}`, text: `Your agent #${k.split(':')[1]}: ${b.observed} of 6 build criteria now observed on chain.` })
  }
  return out
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
