import { beforeEach, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: () => ({ execute: h.execute }) }))
import { storefrontByToken } from './storefront'

beforeEach(() => { h.execute.mockReset() })
it('does not turn a database failure into a missing agent or retain it for the next request', async () => {
  const failure = new Error('Synthetic temporary database failure')
  h.execute.mockRejectedValueOnce(failure).mockResolvedValueOnce([])
  await expect(storefrontByToken('341554', 56)).rejects.toBe(failure)
  await expect(storefrontByToken('341554', 56)).resolves.toBeNull()
  expect(h.execute).toHaveBeenCalledTimes(2)
})
it('returns missing only after a successful empty lookup', async () => {
  h.execute.mockResolvedValue([])
  await expect(storefrontByToken('999999', 97)).resolves.toBeNull()
  expect(h.execute).toHaveBeenCalledTimes(1)
})
it('rejects an invalid token id without querying storage', async () => {
  await expect(storefrontByToken('not-a-token')).resolves.toBeNull()
  expect(h.execute).not.toHaveBeenCalled()
})
