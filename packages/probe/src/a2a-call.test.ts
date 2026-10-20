import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('./safe-fetch.js', () => ({ safeFetch: mocks.fetch }))
import { probeA2ACall } from './a2a-call'
const endpoint = 'https://agent.example/runtime'
const validMessage = { kind: 'message', role: 'agent', messageId: 'response-1', parts: [{ kind: 'text', text: 'I monitor health factors.' }] }
const validTask = { kind: 'task', id: 'task-1', contextId: 'context-1', status: { state: 'completed' } }
let runtimeReply: unknown
beforeEach(() => {
  runtimeReply = validMessage
  mocks.fetch.mockReset().mockImplementation(async (_url, options) => ({
    ok: true, status: 200, latencyMs: 2, headers: {},
    body: JSON.stringify(options?.method === 'POST'
      ? { jsonrpc: '2.0', id: JSON.parse(options.body).id, result: runtimeReply }
      : { name: 'Fixture', url: endpoint, skills: [{ id: 'health-factor', name: 'Health factor' }] }),
  }))
})
describe('explicitly consented A2A call validation', () => {
  it.each([validMessage, validTask, { ...validTask, status: { state: 'working' } }])('accepts a protocol Message or accepted Task', async result => {
    runtimeReply = result
    const out = await probeA2ACall('https://agent.example/card')
    expect(out).toMatchObject({ ok: true, liveness: 'live', taskKinds: [], manifest: { capabilityEvidence: { messageSendCallable: true, taskCompatible: [] } } })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = mocks.fetch.mock.calls[1]!
    expect(url).toBe(endpoint); expect(options).toMatchObject({ method: 'POST', maxRedirects: 0, timeoutMs: 8000 })
    expect(JSON.parse(options.body)).toMatchObject({ method: 'message/send', params: { message: { role: 'user', kind: 'message', parts: [{ kind: 'text', text: 'What can you do?' }] } } })
    expect(options.headers).not.toHaveProperty('authorization')
  })
  it.each([{}, { kind: 'message' }, { ...validMessage, role: 'user' }, { ...validMessage, parts: [] }, { ...validTask, status: { state: 'failed' } }, { ...validTask, status: { state: 'rejected' } }, { ...validTask, contextId: undefined }])('does not promote invalid or rejected answers', async result => {
    runtimeReply = result; expect((await probeA2ACall('https://agent.example/card')).ok).toBe(false)
  })
  it.each([
    { ok: true, status: 200, latencyMs: 1, body: JSON.stringify({ jsonrpc: '2.0', id: 'wrong', result: validMessage }) },
    { ok: true, status: 402, latencyMs: 1, body: '{}' },
    { ok: false, failure: 'blocked_ssrf', latencyMs: 1 },
    { ok: true, status: 200, latencyMs: 1, body: '<html>OK</html>' },
  ])('fails closed without retries or payment for %j', async response => {
    mocks.fetch.mockImplementationOnce(async () => ({ ok: true, status: 200, latencyMs: 1, body: JSON.stringify({ url: endpoint, skills: [{ id: 'health' }] }) })).mockImplementationOnce(async () => response)
    expect((await probeA2ACall('https://agent.example/card')).ok).toBe(false); expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })
  it('does not send a task to an explicitly unbound card', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, latencyMs: 1, body: JSON.stringify({ status: 'UNBOUND', url: endpoint, skills: [{ id: 'health' }] }) })
    expect((await probeA2ACall('https://agent.example/card')).ok).toBe(false); expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
})
