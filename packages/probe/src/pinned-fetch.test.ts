import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { RequestOptions } from 'node:http'

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:http', () => ({ request: mocks.request }))
vi.mock('node:https', () => ({ request: mocks.request }))
import { safeFetch, isBlockedAddress } from './safe-fetch.js'

afterEach(() => vi.resetAllMocks())

function reply(status = 200, headers: Record<string, string> = {}, text = '{}') {
  return (_url: URL, _options: RequestOptions, callback: (response: Readable) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void }
    req.end = () => {
      const response = Object.assign(Readable.from([Buffer.from(text)]), { statusCode: status, headers })
      callback(response)
    }
    return req
  }
}

describe('pinned agent requests', () => {
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

  it('drops credentials on a cross-origin redirect', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mocks.request.mockImplementationOnce(reply(302, { location: 'https://other.example/' }))
      .mockImplementationOnce(reply())
    await safeFetch('https://agent.example/', { headers: { authorization: 'Bearer test-only', cookie: 'test=only' } })
    const options = mocks.request.mock.calls[1]![1] as RequestOptions
    expect(options.headers).not.toHaveProperty('authorization')
    expect(options.headers).not.toHaveProperty('cookie')
  })

  it('bounds DNS latency and returns a typed failure', async () => {
    mocks.lookup.mockImplementation(() => new Promise(() => {}))
    expect(await safeFetch('https://agent.example/', { timeoutMs: 10 }))
      .toMatchObject({ ok: false, failure: 'timeout' })
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('blocks expanded loopback and the full IPv6 link-local range', () => {
    for (const address of ['0:0:0:0:0:0:0:1', 'febf::1', 'fe90::1', '2001:db8::1']) {
      expect(isBlockedAddress(address), address).toBe(true)
    }
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false)
  })
})
