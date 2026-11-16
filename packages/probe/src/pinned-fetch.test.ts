import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { RequestOptions } from 'node:http'

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:http', () => ({ request: mocks.request }))
vi.mock('node:https', () => ({ request: mocks.request }))
import { safeFetch, isBlockedAddress, resetDnsAnswers } from './safe-fetch.js'

afterEach(() => { vi.resetAllMocks(); resetDnsAnswers() })

function reply(status = 200, headers: Record<string, string> = {}, text: string | Uint8Array = '{}') {
  return (_url: URL, _options: RequestOptions, callback: (response: Readable) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void }
    req.end = () => {
      const response = Object.assign(Readable.from([typeof text === 'string' ? Buffer.from(text) : Buffer.from(text)]), { statusCode: status, headers })
      callback(response)
    }
    return req
  }
}

describe('pinned agent requests', () => {
  it('preserves binary bytes behind the same DNS, redirect and response-size guards', async () => {
    const body = new Uint8Array([0, 255, 128, 13, 10])
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementation(reply(200, {}, body))
    expect(await safeFetch('https://agent.example/image', { responseType: 'bytes', maxBytes: 5 }))
      .toMatchObject({ ok: true, body: '', bodyBytes: body, bytes: 5 })
    expect(await safeFetch('https://agent.example/image', { responseType: 'bytes', maxBytes: 4 }))
      .toMatchObject({ ok: false, failure: 'too_large' })
    const options = mocks.request.mock.calls[0]![1] as RequestOptions
    expect(options.lookup).toBeTypeOf('function')
  })
  it('pins the checked address without a second attacker-controlled DNS resolution', async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    mocks.request.mockImplementation(reply())
    expect((await safeFetch('https://agent.example/task')).ok).toBe(true)
    const options = mocks.request.mock.calls[0]![1] as RequestOptions
    const callback = vi.fn()
    options.lookup!('agent.example', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }])
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it('rechecks redirects and stops before requesting private destinations', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementation(reply(302, { location: 'http://169.254.169.254/' }))
    const result = await safeFetch('https://agent.example/')
    expect(result).toMatchObject({ ok: false, failure: 'blocked_ssrf' })
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })

  it.each([301, 302, 303, 307, 308])('blocks HTTPS downgrade status %s before sending a task to an insecure hop', async status => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementationOnce(reply(status, { location: 'http://other.example/task' }))
      .mockImplementationOnce(reply())
    const result = await safeFetch('https://agent.example/task', { method: 'POST', body: 'private-task-bytes', headers: { authorization: 'Bearer test-only' } })
    expect(result).toMatchObject({ ok: false, failure: 'blocked_ssrf', detail: 'HTTPS redirect downgrade to HTTP is blocked' })
    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it.each(['http:', 'https:'])('preserves same-protocol %s redirects and DNS checks', async protocol => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementationOnce(reply(302, { location: `${protocol}//other.example/card` }))
      .mockImplementationOnce(reply())
    expect(await safeFetch(`${protocol}//agent.example/card`)).toMatchObject({ ok: true, redirects: 1 })
    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(mocks.lookup).toHaveBeenCalledTimes(2)
  })

  it('caps a public redirect loop deterministically', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementation(reply(302, { location: 'https://agent.example/loop' }))
    expect(await safeFetch('https://agent.example/start', { maxRedirects: 2 }))
      .toMatchObject({ ok: false, failure: 'too_many_redirects' })
    expect(mocks.request).toHaveBeenCalledTimes(3)
  })

  it('enforces the byte cap while reading a pinned response', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementation(reply(200, {}, 'this response is too large'))
    expect(await safeFetch('https://agent.example/', { maxBytes: 4 }))
      .toMatchObject({ ok: false, failure: 'too_large' })
  })

  it('drops credentials on a cross-origin redirect', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementationOnce(reply(302, { location: 'https://other.example/' }))
      .mockImplementationOnce(reply())
    await safeFetch('https://agent.example/', { headers: { authorization: 'Bearer test-only', cookie: 'test=only' } })
    const options = mocks.request.mock.calls[1]![1] as RequestOptions
    expect(options.headers).not.toHaveProperty('authorization')
    expect(options.headers).not.toHaveProperty('cookie')
  })

  it('bounds DNS latency and names it: a lookup that hangs on our side is not the endpoint timing out', async () => {
    mocks.lookup.mockImplementation(() => new Promise(() => {}))
    expect(await safeFetch('https://agent.example/', { timeoutMs: 10 }))
      .toMatchObject({ ok: false, failure: 'dns', detail: 'name resolution did not finish in time' })
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('asks for a host name once while many fetches share it, validating the answer every time', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementation(reply())
    const results = await Promise.all(Array.from({ length: 25 }, (_v, i) => safeFetch(`https://platform.example/agents/${i}/card`)))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
    expect(mocks.request).toHaveBeenCalledTimes(25)
    for (const call of mocks.request.mock.calls) {
      const callback = vi.fn()
      ;(call[1] as RequestOptions).lookup!('platform.example', { all: true }, callback)
      expect(callback).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }])
    }
  })

  it('never reuses a remembered answer to reach a private address', async () => {
    mocks.lookup.mockResolvedValue([{ address: '10.0.0.7', family: 4 }])
    for (let i = 0; i < 3; i++) {
      expect(await safeFetch('https://rebind.example/')).toMatchObject({ ok: false, failure: 'blocked_ssrf' })
    }
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('gives the endpoint its whole time budget after its name resolves', async () => {
    mocks.lookup.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([{ address: '8.8.8.8', family: 4 }]), 40)))
    mocks.request.mockImplementation(reply())
    expect(await safeFetch('https://slow-dns.example/', { timeoutMs: 60 })).toMatchObject({ ok: true })
  })

  it('still times out an endpoint that resolves and then never answers', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementation((_url: URL, options: RequestOptions) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void }
      req.end = () => { options.signal!.addEventListener('abort', () => req.emit('error', Object.assign(new Error('aborted'), { name: 'AbortError' }))) }
      return req
    })
    expect(await safeFetch('https://silent.example/', { timeoutMs: 20 })).toMatchObject({ ok: false, failure: 'timeout' })
  })

  it('remembers a failed lookup briefly, so a dead host costs one lookup and not one per agent', async () => {
    mocks.lookup.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND gone.example'), { code: 'ENOTFOUND' }))
    for (let i = 0; i < 5; i++) expect((await safeFetch(`https://gone.example/${i}`)).ok).toBe(false)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it('blocks expanded loopback and the full IPv6 link-local range', () => {
    for (const address of ['0:0:0:0:0:0:0:1', 'febf::1', 'fe90::1', '2001:db8::1']) {
      expect(isBlockedAddress(address), address).toBe(true)
    }
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false)
  })
})
