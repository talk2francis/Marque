import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ projection: vi.fn(), execute: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@marque/db', () => ({ db: () => ({ execute: h.execute }), cachedProjection: h.projection }))
vi.mock('@marque/commerce/reads', () => ({ boundedCommerceRead: h.execute }))
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(1_000_000); h.projection.mockReset(); h.execute.mockReset() })
afterEach(() => vi.useRealTimers())

it('restores the complete shared wallet set without extending its original ten-minute freshness', async () => {
  h.projection.mockResolvedValue({ value: { at: 401_000, wallets: ['owner', 'agent-wallet'] }, computedAt: new Date(401_000).toISOString() })
  const { operatorWalletsHere } = await import('./operators-here')
  expect([...await operatorWalletsHere()]).toEqual(['owner', 'agent-wallet'])
  await operatorWalletsHere(); expect(h.projection).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1_001)
  await operatorWalletsHere(); expect(h.projection).toHaveBeenCalledTimes(2)
  expect(h.projection.mock.calls[0]![2]).toMatchObject({ freshMs: 600_000, maxStaleMs: 600_000, coordinateCold: true })
})

it('keeps the same measured wallets and retries a failed shared read', async () => {
  h.projection.mockRejectedValueOnce(Error('Synthetic unavailable'))
  h.execute.mockResolvedValue([{ w: 'owner' }, { w: 'agent-wallet' }])
  h.projection.mockImplementationOnce(async (_key, compute) => {
    const value = await compute()
    return { value, computedAt: new Date(value.at).toISOString() }
  })
  const { operatorWalletsHere } = await import('./operators-here')
  await expect(operatorWalletsHere()).rejects.toThrow('Synthetic unavailable')
  expect([...await operatorWalletsHere()]).toEqual(['owner', 'agent-wallet'])
  expect(h.execute).toHaveBeenCalledOnce()
})
