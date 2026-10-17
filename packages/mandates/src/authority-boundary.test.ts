import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ write: vi.fn(), send: vi.fn(), read: vi.fn(), sdk: vi.fn(), key: vi.fn(), storeGet: vi.fn() }))
vi.mock('viem', async original => ({ ...await original<typeof import('viem')>(), createWalletClient: () => ({ writeContract: mock.write, sendTransaction: mock.send }), createPublicClient: () => ({ readContract: mock.read }) }))
vi.mock('viem/accounts', async original => ({ ...await original<typeof import('viem/accounts')>(), privateKeyToAccount: () => ({ address: `0x${'1'.repeat(40)}` }) }))
vi.mock('@altananetwork/sdk', () => ({ BNB: {}, BNB_TESTNET: {}, createClient: mock.sdk, signerFromPrivateKey: mock.key, createPrivateKeySigner: mock.key }))
import { RegistryCharterService } from './providers/registry.js'
import { AltanaCharterService } from './providers/altana.js'
import type { CharterGrant } from './types.js'
describe('unverified authority is unavailable before any signing or network', () => {
  beforeEach(() => { vi.clearAllMocks() })
  const registry = () => new RegistryCharterService({ chainId: 97, rpcUrl: 'https://fixture.invalid', registryAddress: `0x${'2'.repeat(40)}`, privateKey: '0x' })
  it.each([56, 1, 0])('rejects registry construction on %s', chainId => {
    expect(() => new RegistryCharterService({ chainId, rpcUrl: 'https://fixture.invalid', registryAddress: `0x${'2'.repeat(40)}`, privateKey: '0x' })).toThrow()
  })
  it('rejects a registry grant before reading input or writing an anchor', async () => {
    await expect(registry().grant({} as CharterGrant)).rejects.toThrow('read-only policy preview')
    expect(mock.write).not.toHaveBeenCalled(); expect(mock.read).not.toHaveBeenCalled()
  })
  it('rejects registry execution before state, token checks, store reads or sends', async () => {
    await expect(registry().execute({ charterId: 'historical', calls: [] })).rejects.toThrow('read-only policy preview')
    expect(mock.read).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled()
  })
  it.each([56, 97, 1])('quarantines Altana before SDK or signer initialization on %s', chainId => {
    expect(() => new AltanaCharterService({ chainId, adminPrivateKey: '0x' })).toThrow('read-only policy preview')
    expect(mock.sdk).not.toHaveBeenCalled(); expect(mock.key).not.toHaveBeenCalled()
  })
})
