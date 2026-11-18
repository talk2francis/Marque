import { describe, expect, it } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { RegistryCharterService } from '../providers/registry.js'

/** Regression for review R-04 (MC-CX-003): a reverted anchor must not be recorded as a revocation. */
// A throwaway key generated per run: no real account, used only to construct the service offline.
const TEST_KEY = generatePrivateKey()

function service(status: 'success' | 'reverted') {
  const patches: Array<Record<string, unknown>> = []
  const store = {
    get: async () => ({ id: 'c1', policyHash: '0x' + '11'.repeat(32), status: 'active' }),
    patch: async (_id: string, p: Record<string, unknown>) => { patches.push(p) },
  }
  const s = new RegistryCharterService({ registryAddress: '0x0000000000000000000000000000000000000001', privateKey: TEST_KEY, rpcUrl: 'http://127.0.0.1:9', chainId: 97, store: store as never })
  const inner = s as unknown as { wallet: unknown; pub: unknown }
  inner.wallet = { writeContract: async () => '0x' + 'ab'.repeat(32) }
  inner.pub = { waitForTransactionReceipt: async () => ({ status }) }
  return { s, patches }
}

describe('RegistryCharterService.revoke (R-04)', () => {
  it('does not record a revocation when the anchor reverted', async () => {
    const { s, patches } = service('reverted')
    const r = await s.revoke('c1')
    expect(r.ok).toBe(false)
    expect(patches).toHaveLength(0)
  })
  it('records a revocation when the anchor succeeded', async () => {
    const { s, patches } = service('success')
    const r = await s.revoke('c1')
    expect(r.ok).toBe(true)
    expect(patches[0]?.['status']).toBe('revoked')
  })
})
