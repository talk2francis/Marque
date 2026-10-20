import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { safeFetch } from './safe-fetch.js'
import { probeA2A, failureFromFetch, httpFailure, type ProbeOutcome } from './liveness.js'

const part = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1) }),
  z.object({ kind: z.literal('data'), data: z.record(z.unknown()) }),
  z.object({ kind: z.literal('file'), file: z.object({ uri: z.string().min(1).optional(), bytes: z.string().min(1).optional() }).refine(f => !!f.uri || !!f.bytes) }),
])
const message = z.object({ kind: z.literal('message'), role: z.literal('agent'), messageId: z.string().min(1), parts: z.array(part).min(1) })
const task = z.object({ kind: z.literal('task'), id: z.string().min(1), contextId: z.string().min(1), status: z.object({ state: z.enum(['submitted', 'working', 'input-required', 'completed', 'canceled', 'failed', 'rejected', 'auth-required', 'unknown']) }) })
const reply = z.object({ jsonrpc: z.literal('2.0'), id: z.string(), result: z.union([message, task]), error: z.unknown().optional() })

/** Only call after explicit task consent. Never used by scheduled discovery. */
export async function probeA2ACall(url: string): Promise<ProbeOutcome> {
  const card = await probeA2A(url)
  if (!card.manifest || !card.executableEndpoint) return card
  const id = randomUUID()
  const request = JSON.stringify({ jsonrpc: '2.0', id, method: 'message/send', params: {
    message: { role: 'user', messageId: randomUUID(), kind: 'message', parts: [{ kind: 'text', text: 'What can you do?' }] },
  } })
  const response = await safeFetch(card.executableEndpoint, {
    method: 'POST', maxRedirects: 0, timeoutMs: 8_000, maxBytes: 512 * 1024,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: request,
  })
  let parsed: unknown
  if (response.ok) { try { parsed = JSON.parse(response.body) } catch { /* invalid JSON is a failed validation */ } }
  const validated = reply.safeParse(parsed)
  const accepted = response.ok && response.status === 200 && validated.success && validated.data.id === id
    && validated.data.error === undefined && (validated.data.result.kind === 'message'
      || ['submitted', 'working', 'input-required', 'completed'].includes(validated.data.result.status.state))
  const detail = accepted
    ? `message/send validated (${validated.data.result.kind}${validated.data.result.kind === 'task' ? `, ${validated.data.result.status.state}` : ''}); no category or MCS result implied`
    : !response.ok ? `message/send transport failed: ${response.failure}`
      : response.status !== 200 ? `message/send returned HTTP ${response.status}; no payment or follow-up sent`
        : 'message/send did not return a matching successful JSON-RPC Message or accepted Task'
  return {
    ...card, ok: accepted, liveness: accepted ? 'live' : response.ok && response.status === 200 ? 'bad_schema' : 'dead',
    failureClass: accepted ? null : !response.ok ? failureFromFetch(response.failure) : response.status !== 200 ? httpFailure(response.status) : 'bad_schema',
    statusCode: response.ok ? response.status : response.status ?? null,
    latencyMs: card.latencyMs + response.latencyMs, detail, taskKinds: [],
    callEvidence: { request, response: response.ok ? response.body : null },
    manifest: { ...card.manifest, capabilityEvidence: {
      cardReadable: true, endpointDiscovered: true, endpointReachable: response.ok,
      messageSendCallable: accepted, taskCompatible: [],
    } },
  }
}
