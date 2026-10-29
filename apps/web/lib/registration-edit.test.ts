import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ block: vi.fn(), read: vi.fn(), execute: vi.fn(), metadata: vi.fn(), sync: vi.fn() }))
vi.mock('@marque/db', () => ({ db: () => ({ execute: m.execute }) }))
vi.mock('@marque/commerce', () => ({
  chainClient: () => ({ getBlockNumber: m.block, readContract: m.read }),
  isSupportedChain: (id: number) => id === 56 || id === 97,
  network: () => ({ identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e' }),
}))
vi.mock('@marque/probe', () => ({ readRegistrationMetadata: m.metadata }))
vi.mock('@marque/registry', () => ({ syncDeclaredServices: m.sync }))

import { reindexRegistration } from './registration-edit'

beforeEach(() => {
  vi.resetAllMocks()
  m.block.mockResolvedValue(123n)
  m.read.mockResolvedValue('data:application/json;base64,e30=')
  m.metadata.mockResolvedValue({ name: 'Spartans', services: [{ name: 'A2A', endpoint: 'https://agent.example/a2a' }] })
  m.execute.mockResolvedValue([])
  m.sync.mockResolvedValue(undefined)
})

describe('registration index refresh', () => {
  it('reports a refresh only after the declared services have been synchronised', async () => {
    const result = await reindexRegistration(97, '2672')
    expect(result).toEqual({ name: 'Spartans' })
    expect(m.sync).toHaveBeenCalledWith(expect.objectContaining({ chainId: 97, tokenId: '2672', blockNumber: '123' }))
  })
  it('does not report success when the service index failed to update', async () => {
    m.sync.mockRejectedValue(new Error('service index unavailable'))
    await expect(reindexRegistration(97, '2672')).rejects.toThrow('service index unavailable')
  })
})
