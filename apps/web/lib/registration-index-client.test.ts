import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshRegistrationIndex, registrationForEdit } from './registration-index-client'

afterEach(() => vi.useRealTimers())

describe('registration read identity', () => {
  const metadata = { name: 'Spartans', services: [{ name: 'A2A', endpoint: 'https://agent.example/a2a' }], extension: { retained: true } }
  const value = { chainId: 97, tokenId: '2672', owner: '0x00000000000000000000000000000000000000aa', stored: 'onchain', registration: metadata }
  it('preserves services and extension fields for the exact requested identity', () => {
    expect(registrationForEdit(value, 97, '2672').registration).toEqual(metadata)
  })
  it('rejects a response for another network or another token before it can become a transaction', () => {
    expect(() => registrationForEdit(value, 56, '2672')).toThrow('did not match')
    expect(() => registrationForEdit(value, 97, '2673')).toThrow('did not match')
  })
  it('rejects an unreadable owner or missing registration', () => {
    expect(() => registrationForEdit({ ...value, owner: null }, 97, '2672')).toThrow('did not match')
    expect(() => registrationForEdit({ ...value, registration: null }, 97, '2672')).toThrow('did not match')
  })
})

describe('confirmed registration index refresh', () => {
  it('refreshes the exact agent on the network where its transaction was confirmed', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ refreshed: true, name: 'Spartans' })))
    expect(await refreshRegistrationIndex(97, '2672', fetcher)).toBe(true)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith('/api/v1/builders/registration/refresh', expect.objectContaining({ method: 'POST', body: '{"chainId":97,"tokenId":"2672"}' }))
  })
  it.each([429, 503])('reports the index as pending after HTTP %s', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ refreshed: true }), { status }))
    expect(await refreshRegistrationIndex(97, '2672', fetcher)).toBe(false)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each(['not JSON', '{"name":"Spartans"}', '{"refreshed":"true"}'])('requires an explicit successful refresh response: %s', async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body))
    expect(await refreshRegistrationIndex(97, '2672', fetcher)).toBe(false)
  })
  it('keeps a network failure separate from the already confirmed transaction', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await refreshRegistrationIndex(56, '341556', fetcher)).toBe(false)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('bounds an unresponsive index request instead of leaving the confirmed update busy indefinitely', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const pending = refreshRegistrationIndex(97, '2672', fetcher)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
