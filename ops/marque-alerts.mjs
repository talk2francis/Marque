#!/usr/bin/env node
/**
 * Marque launch alerts (LAUNCH-RUNBOOK section 3, P2-11 item 5). One pass a minute under PM2
 * (`marque-alerts`). Each signal fires one Telegram message when its condition has held for
 * its window, and one recovery message when it clears. State lives in
 * /root/.marque/alerts-state.json so a restart neither re-pages nor forgets.
 *
 *   node ops/marque-alerts.mjs            loop (PM2)
 *   node ops/marque-alerts.mjs --once     one pass, print every signal's reading
 *   node ops/marque-alerts.mjs --test     send one test message per signal, then exit
 *
 * Telegram: MARQUE_TELEGRAM_BOT_TOKEN and MARQUE_TELEGRAM_CHAT_ID in secrets.env. Without
 * them every alert is written to stdout (PM2 log) and nothing is paged.
 */
import { readFileSync, writeFileSync, existsSync, statfsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import postgres from 'postgres'

const SECRETS = '/root/.marque/secrets.env'
const env = Object.fromEntries(readFileSync(SECRETS, 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const BASE = env.MARQUE_PUBLIC_URL || 'https://marque.trade'
const TOKEN = env.MARQUE_TELEGRAM_BOT_TOKEN || ''
const CHAT = env.MARQUE_TELEGRAM_CHAT_ID || ''
const STATE = '/root/.marque/alerts-state.json'
const ACCESS_LOG = '/var/log/caddy/marque-access.log'
const KEEPER = '0x781ee69bf9f9C14E2BC496181714f4DF5348556a'
const KEEPER_MIN_BNB = 0.0005
const sql = postgres(env.DATABASE_URL, { max: 2, idle_timeout: 20 })

const args = new Set(process.argv.slice(2))
const log = (...a) => console.log(new Date().toISOString(), ...a)

async function telegram(text) {
  if (!TOKEN || !CHAT) { log('[telegram off]', text.replace(/\n/g, ' | ')); return false }
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => ({ ok: false, statusText: e.message }))
  if (!r.ok) log('[telegram failed]', r.status ?? '', r.statusText ?? '')
  return r.ok
}

const getJson = async (path) => {
  const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20_000), headers: { 'cache-control': 'no-cache' } })
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return r.json()
}

/**
 * Every signal: `read` returns { bad, detail }; `holdMs` is how long `bad` must hold before
 * paging. Readings that cannot be taken count as bad only for the signals where silence is
 * itself the incident.
 */
const SIGNALS = [
  {
    id: 'indexer_lag', title: 'Quest index lag on BSC mainnet', holdMs: 2 * 60_000,
    read: async () => {
      const p = await getJson('/api/v1/pulse')
      const lag = p.network?.lagBlocks
      return { bad: lag === null || lag > 200, detail: lag === null ? 'indexer lag unknown (no head or cursor)' : `${lag} blocks behind head` }
    },
  },
  {
    id: 'seller_quotes', title: 'Reference seller not quoting', holdMs: 0,
    read: async () => {
      const fp = JSON.parse(readFileSync('/root/marque/config/first-party.json', 'utf8')).agents.filter((a) => a.chainId === 56)
      const rows = await sql`
        select q.agent_id, max(q.created_at) filter (where q.ok) as last_ok, max(q.created_at) as last_any
        from commerce_quote q where q.agent_id = any(${fp.map((a) => `56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:${a.tokenId}`)})
        group by q.agent_id`
      const now = Date.now()
      const failing = fp.filter((a) => {
        const r = rows.find((x) => x.agent_id.endsWith(`:${a.tokenId}`))
        return !r || !r.last_ok || now - new Date(r.last_ok).getTime() > 25 * 60_000
      })
      return { bad: failing.length > 0, detail: failing.length ? `no good quote in 25 min: ${failing.map((a) => a.slug).join(', ')}` : `all ${fp.length} quoting` }
    },
  },
  {
    id: 'hireable_per_category', title: 'A quest category has fewer than 3 hireable agents', holdMs: 5 * 60_000,
    read: async () => {
      const c = await getJson('/api/v1/phase2/coverage')
      const low = (c.categories ?? []).filter((x) => x.inQuest && x.hireable < 3)
      return { bad: low.length > 0, detail: low.length ? low.map((x) => `${x.category} ${x.hireable}`).join(', ') : (c.categories ?? []).filter((x) => x.inQuest).map((x) => `${x.category} ${x.hireable}`).join(', ') }
    },
  },
  {
    id: 'http_5xx', title: '5xx rate over 1% on marque.trade', holdMs: 5 * 60_000,
    read: async () => {
      if (!existsSync(ACCESS_LOG)) return { bad: false, detail: 'no access log yet' }
      const since = Date.now() / 1000 - 300
      // The last 4 MB is minutes of traffic even under load; reading by bytes keeps the
      // monitor small (reading 20k lines of a load test pushed it past its ceiling).
      const lines = execFileSync('tail', ['-c', '4000000', ACCESS_LOG], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\n')
      let total = 0; let err = 0
      for (const l of lines) {
        if (!l) continue
        try { const j = JSON.parse(l); if (j.ts < since) continue; total++; if (j.status >= 500) err++ } catch { /* partial line */ }
      }
      const rate = total ? err / total : 0
      return { bad: total >= 50 && rate > 0.01, detail: `${err} of ${total} requests in 5 min (${(rate * 100).toFixed(2)}%)` }
    },
  },
  {
    id: 'keeper_bnb', title: 'Keeper wallet low on BNB', holdMs: 0,
    read: async () => {
      const r = await fetch('https://bsc-dataseed.bnbchain.org', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [KEEPER, 'latest'] }), signal: AbortSignal.timeout(10_000) })
      const bnb = Number(BigInt((await r.json()).result)) / 1e18
      return { bad: bnb < KEEPER_MIN_BNB, detail: `${bnb.toFixed(5)} BNB (alert under ${KEEPER_MIN_BNB}; settles are MegaFuel-sponsored, the balance is the fallback)` }
    },
  },
  {
    id: 'disk', title: 'Disk over 80%', holdMs: 0,
    read: async () => {
      const s = statfsSync('/')
      const used = 1 - s.bavail / s.blocks
      return { bad: used > 0.8, detail: `${(used * 100).toFixed(1)}% used` }
    },
  },
  {
    id: 'pm2_restart_loop', title: 'A Marque process is restart-looping', holdMs: 0,
    read: async () => {
      const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
      const prev = readState().restarts ?? {}
      const now = Date.now()
      const hist = {}
      const looping = []
      for (const p of list.filter((x) => x.name.startsWith('marque-'))) {
        const n = p.pm2_env.restart_time ?? 0
        const h = (prev[p.name] ?? []).filter((e) => now - e.at < 10 * 60_000)
        if (!h.length || h[h.length - 1].n !== n) h.push({ at: now, n })
        hist[p.name] = h
        if (h.length && n - h[0].n >= 3) looping.push(`${p.name} (${n - h[0].n} restarts in 10 min)`)
      }
      pending.restarts = hist
      return { bad: looping.length > 0, detail: looping.length ? looping.join(', ') : 'no restart loops' }
    },
  },
  {
    // PM2's own ceiling watches only a tsx wrapper for the reference sellers, so their real
    // process tree (wrapper plus child) is summed here against the same 300 MB ceiling.
    id: 'seller_memory', title: 'A reference seller is over its memory ceiling', holdMs: 5 * 60_000,
    read: async () => {
      const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
      const over = []
      const seen = []
      for (const p of list.filter((x) => /^marque-(bound|lattice|sluicegate|redcell|keel|tidemark)$/.test(x.name) && x.pid)) {
        const pids = [String(p.pid), ...execFileSync('pgrep', ['-P', String(p.pid)], { encoding: 'utf8' }).split('\n').filter(Boolean)]
        const kb = pids.reduce((a, pid) => { try { return a + Number(execFileSync('ps', ['-o', 'rss=', '--pid', pid], { encoding: 'utf8' }).trim() || 0) } catch { return a } }, 0)
        const mb = Math.round(kb / 1024)
        seen.push(`${p.name.slice(7)} ${mb}`)
        if (mb > 300) over.push(`${p.name} ${mb} MB`)
      }
      return { bad: over.length > 0, detail: over.length ? over.join(', ') : `MB: ${seen.join(', ')}` }
    },
  },
  {
    id: 'stuck_jobs', title: 'Paid jobs with no successful notify', holdMs: 0,
    read: async () => {
      const rows = await sql`
        select j.chain_id, j.job_id from commerce_job j
        join hire_intent i on i.id = j.intent_id
        join commerce_event e on e.chain_id = j.chain_id and e.job_id = j.job_id and e.name = 'JobFunded'
        where j.state = 'FUNDED' and e.block_time < now() - interval '10 minutes' and e.block_time > now() - interval '2 days'
          and not exists (select 1 from notify_attempt n where n.chain_id = j.chain_id and n.job_id = j.job_id and n.ok)`
      return { bad: rows.length > 0, detail: rows.length ? rows.map((r) => `${r.chain_id}:${r.job_id}`).join(', ') : 'none' }
    },
  },
]

let pending = {}
function readState() { try { return JSON.parse(readFileSync(STATE, 'utf8')) } catch { return {} } }
function writeState(s) { writeFileSync(STATE, JSON.stringify(s, null, 2)) }

async function pass({ print = false } = {}) {
  const state = readState()
  pending = {}
  state.signals ??= {}
  for (const s of SIGNALS) {
    let reading
    try { reading = await s.read() } catch (e) { reading = { bad: false, detail: `could not read: ${e.message}`, error: true } }
    if (print) log(`${reading.bad ? 'BAD ' : 'ok  '} ${s.id.padEnd(22)} ${reading.detail}`)
    const cur = state.signals[s.id] ?? { since: null, alerted: false }
    if (reading.bad) {
      cur.since ??= Date.now()
      if (!cur.alerted && Date.now() - cur.since >= s.holdMs) {
        await telegram(`Marque alert: ${s.title}\n${reading.detail}\n${BASE}/status`)
        cur.alerted = true
      }
    } else if (!reading.error) {
      if (cur.alerted) await telegram(`Marque recovered: ${s.title}\n${reading.detail}`)
      cur.since = null; cur.alerted = false
    }
    cur.detail = reading.detail; cur.at = new Date().toISOString()
    state.signals[s.id] = cur
  }
  if (pending.restarts) state.restarts = pending.restarts
  writeState(state)
}

if (args.has('--test')) {
  const sent = []
  for (const s of SIGNALS) {
    let detail
    try { detail = (await s.read()).detail } catch (e) { detail = `could not read: ${e.message}` }
    sent.push({ id: s.id, ok: await telegram(`Marque alert TEST (not an incident): ${s.title}\nCurrent reading: ${detail}`) })
  }
  log(JSON.stringify(sent))
  await sql.end(); process.exit(0)
}
if (args.has('--once')) { await pass({ print: true }); await sql.end(); process.exit(0) }

log(`marque-alerts up, base ${BASE}, telegram ${TOKEN && CHAT ? 'on' : 'OFF (stdout only)'}`)
for (;;) {
  await pass().catch((e) => log('pass failed', e.message))
  await new Promise((r) => setTimeout(r, 60_000))
}
