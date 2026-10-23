import 'server-only'
import { randomUUID } from 'node:crypto'
import { safeFetch } from '@marque/probe'
import { classifyByKeyword } from '@marque/registry'
import { cardShapeIssues, exampleCard, hostVerdict, FORGE_CATEGORIES, type ForgeCategory } from '@marque/commerce'

/**
 * The Agent Forge card check (SPEC-BUILDERS 5), shared by all three doors. Every outbound call goes
 * through safeFetch (DNS first, private ranges refused, redirects re-validated, size and time caps).
 * Each failure says what failed, shows what Marque got (secrets redacted) and how to fix it.
 */
export type StepState = 'pass' | 'warn' | 'fail' | 'skipped'
export interface CardStep { id: 'fetch' | 'shape' | 'category' | 'task' | 'domain'; title: string; state: StepState; detail: string; fix?: string; example?: string; got?: string }
export interface CardCheck { url: string; ok: boolean; category: ForgeCategory | null; name: string | null; endpoint: string | null; steps: CardStep[]; checkedAt: string }

const CATEGORY_WORDS: Record<string, string> = { health_factor: 'health factor', yield: 'yield', grid: 'grid trading', rebalancing: 'rebalancing', security: 'security' }

/** Long hex, bearer-looking and key-named values never leave the server. */
export function redact(text: string, max = 600): string {
  return text
    .replace(/0x[0-9a-fA-F]{64,}/g, '0x[redacted]')
    .replace(/("?(?:api[_-]?key|secret|token|password|authorization|private[_-]?key)"?\s*[:=]\s*)"[^"]*"/gi, '$1"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .slice(0, max)
}

export async function checkCard(url: string, want: ForgeCategory | null = null): Promise<CardCheck> {
  const steps: CardStep[] = []
  const done = (category: ForgeCategory | null, name: string | null, endpoint: string | null): CardCheck => ({
    url, ok: steps.every((s) => s.state === 'pass' || s.state === 'warn'), category, name, endpoint, steps, checkedAt: new Date().toISOString(),
  })
  const skip = (from: CardStep['id'][]) => from.forEach((id) => steps.push({ id, title: TITLES[id], state: 'skipped', detail: 'Runs after the step above passes.' }))
  const example = (c: ForgeCategory | null) => JSON.stringify(exampleCard(c ?? want ?? 'health_factor'), null, 2)

  // 1. Reachable JSON over https from a public host.
  if (!/^https:\/\//i.test(url)) {
    steps.push({ id: 'fetch', title: TITLES.fetch, state: 'fail', detail: 'The card URL is not https.', fix: 'Serve the card over https, for example https://your-domain/.well-known/agent-card.json.' })
    skip(['shape', 'category', 'task', 'domain']); return done(null, null, null)
  }
  const r = await safeFetch(url, { timeoutMs: 5000, maxBytes: 256 * 1024, headers: { accept: 'application/json' } })
  if (!r.ok) {
    const why: Record<string, string> = {
      dns: 'The host name does not resolve.', tls: 'The TLS handshake failed (certificate problem).', timeout: 'No answer within 5 seconds.',
      refused: 'The connection was refused.', blocked_ssrf: 'The host resolves to a private or reserved address. Marque only calls public hosts.',
      too_large: 'The response is over 256 KB.', too_many_redirects: 'Too many redirects.', bad_url: 'Not a valid URL.', unknown: 'The request failed.',
    }
    steps.push({ id: 'fetch', title: TITLES.fetch, state: 'fail', detail: why[r.failure] ?? why['unknown']!, fix: r.failure === 'timeout' ? 'Serve the card as a static file or cache it; it must answer within 5 seconds.' : 'Check the URL opens in a browser from outside your network, over https.' })
    skip(['shape', 'category', 'task', 'domain']); return done(null, null, null)
  }
  if (r.status !== 200) {
    steps.push({ id: 'fetch', title: TITLES.fetch, state: 'fail', detail: `The server answered HTTP ${r.status}, not 200.`, fix: 'Point the URL at the card itself; a 404 usually means the path is wrong (most agents serve /.well-known/agent-card.json).', got: redact(r.body) })
    skip(['shape', 'category', 'task', 'domain']); return done(null, null, null)
  }
  let card: unknown
  try { card = JSON.parse(r.body) } catch {
    steps.push({ id: 'fetch', title: TITLES.fetch, state: 'fail', detail: 'The response is not JSON.', fix: 'Return the card as JSON with Content-Type application/json, not an HTML page.', got: redact(r.body), example: example(null) })
    skip(['shape', 'category', 'task', 'domain']); return done(null, null, null)
  }
  steps.push({ id: 'fetch', title: TITLES.fetch, state: 'pass', detail: `HTTP 200 in ${r.latencyMs} ms, ${r.bytes.toLocaleString('en-US')} bytes of JSON${r.redirects ? ` after ${r.redirects} redirect${r.redirects === 1 ? '' : 's'}` : ''}.` })
  const c = (card ?? {}) as Record<string, unknown>
  const name = typeof c['name'] === 'string' ? c['name'] : null
  const endpoint = typeof c['url'] === 'string' ? c['url'] : null

  // 2. A2A card shape.
  const issues = cardShapeIssues(card)
  steps.push(issues.length
    ? { id: 'shape', title: TITLES.shape, state: 'fail', detail: `Your endpoint returned JSON, but not a complete A2A agent card: ${issues.slice(0, 4).map((i) => `${i.field} (${i.problem.toLowerCase().replace(/\.$/, '')})`).join('; ')}${issues.length > 4 ? `, and ${issues.length - 4} more` : ''}.`, fix: issues.map((i) => i.fix).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).join(' '), got: redact(r.body), example: example(null) }
    : { id: 'shape', title: TITLES.shape, state: 'pass', detail: `name, description, url, version, capabilities and ${(c['skills'] as unknown[]).length} skill${(c['skills'] as unknown[]).length === 1 ? '' : 's'} are present.` })

  // 3. A Marque category, and the words that decided it.
  const skills = Array.isArray(c['skills']) ? (c['skills'] as Array<Record<string, unknown>>) : []
  const cls = classifyByKeyword({
    name, description: typeof c['description'] === 'string' ? c['description'] : null,
    tags: skills.flatMap((s) => (Array.isArray(s['tags']) ? (s['tags'] as unknown[]).map(String) : [])),
    skills: skills.flatMap((s) => [s['name'], s['description']].filter((x): x is string => typeof x === 'string')),
  })
  const category = (FORGE_CATEGORIES as readonly string[]).includes(cls.category) ? (cls.category as ForgeCategory) : null
  if (!category) steps.push({ id: 'category', title: TITLES.category, state: 'fail', detail: 'No skill names, descriptions or tags place it in health factor, yield, grid trading, rebalancing or security.', fix: `Describe the skill in plain words a buyer would search for, and tag it.${want ? ` For ${CATEGORY_WORDS[want]}, for example tags ${JSON.stringify(exampleCard(want).skills[0]!.tags)}.` : ''}`, example: example(want) })
  else if (want && category !== want) steps.push({ id: 'category', title: TITLES.category, state: 'warn', detail: `It reads as ${CATEGORY_WORDS[category]}, not ${CATEGORY_WORDS[want]} (${cls.rationale}).`, fix: `If it is ${CATEGORY_WORDS[want]}, say so in the skill description and tags.` })
  else steps.push({ id: 'category', title: TITLES.category, state: 'pass', detail: `Reads as ${CATEGORY_WORDS[category]}, confidence ${Math.round(cls.confidence * 100)}%. Deciding words: ${cls.rationale}.` })

  // 4. The task protocol answers a harmless message/send.
  if (!endpoint || !/^https:\/\//.test(endpoint)) {
    steps.push({ id: 'task', title: TITLES.task, state: issues.some((i) => i.field === 'url') ? 'skipped' : 'fail', detail: 'The card names no https endpoint to send a task to.', fix: 'Set "url" to the JSON-RPC endpoint that answers message/send.' })
  } else {
    const rpc = { jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { role: 'user', messageId: randomUUID(), parts: [{ kind: 'text', text: 'Marque card check: reply with one sentence on what you can do. No action is needed and nothing is paid.' }] } } }
    const t = await safeFetch(endpoint, { method: 'POST', timeoutMs: 10_000, maxBytes: 256 * 1024, headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(rpc) })
    if (!t.ok) steps.push({ id: 'task', title: TITLES.task, state: 'fail', detail: t.failure === 'timeout' ? 'No answer to message/send within 10 seconds.' : `The endpoint could not be reached (${t.failure}).`, fix: 'Answer message/send within 10 seconds; acknowledge first and work asynchronously if a task takes longer.' })
    else {
      let j: Record<string, unknown> | null = null
      try { j = JSON.parse(t.body) as Record<string, unknown> } catch { /* not json */ }
      if (t.status >= 400 || !j) steps.push({ id: 'task', title: TITLES.task, state: 'fail', detail: `message/send returned HTTP ${t.status}${j ? '' : ' and no JSON'}.`, fix: 'Return a JSON-RPC 2.0 response: {"jsonrpc":"2.0","id":1,"result":{...}}.', got: redact(t.body) })
      else if (j['error']) steps.push({ id: 'task', title: TITLES.task, state: 'fail', detail: 'message/send returned a JSON-RPC error.', fix: 'Accept a plain text message part and answer it; refuse only tasks you cannot price, with a reason.', got: redact(JSON.stringify(j['error'])) })
      else if (!('result' in j)) steps.push({ id: 'task', title: TITLES.task, state: 'fail', detail: 'The response has no "result".', fix: 'Wrap the answer in "result" (a Message or a Task).', got: redact(t.body) })
      else steps.push({ id: 'task', title: TITLES.task, state: 'pass', detail: `message/send answered in ${t.latencyMs} ms with a result.` })
    }
  }

  // 5. A domain the builder controls.
  const h = hostVerdict(url)
  steps.push({ id: 'domain', title: TITLES.domain, state: h.state === 'ok' ? 'pass' : h.state, detail: h.reason, ...(h.state !== 'ok' ? { fix: 'Serve the card from a domain you own, for example https://agent.your-domain/.well-known/agent-card.json.' } : {}) })
  return done(category, name, endpoint)
}

const TITLES: Record<CardStep['id'], string> = {
  fetch: 'Reachable over https', shape: 'A2A agent card', category: 'Marque category', task: 'Answers a task', domain: 'Domain agent card',
}
