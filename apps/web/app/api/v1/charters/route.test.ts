import { expect, it, vi } from 'vitest'
const list = vi.hoisted(() => vi.fn())
vi.mock('../../../../lib/charters', () => ({ listCharters: list, CHARTER_CHAIN_ID: 97 }))
import { GET, POST } from './route'
it('refuses new grants without reading the body, database or signer', async () => {
  const response = await POST()
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'authority_unverified', mode: 'READ_ONLY_POLICY_PREVIEW' })
  expect(list).not.toHaveBeenCalled()
})
it('preserves historical list JSON', async () => {
  list.mockResolvedValue([{ id: 'synthetic-history' }])
  expect(await (await GET()).json()).toEqual({ chainId: 97, charters: [{ id: 'synthetic-history' }] })
})
