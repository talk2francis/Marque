import { expect, it, vi } from 'vitest'
import type { charter as table } from '@marque/db'
import { serialiseGrant } from '@marque/mandates/store'
const mocked = vi.hoisted(() => ({ rows: [] as unknown[], update: vi.fn(() => { throw new Error('GET must not update') }) }))
vi.mock('@marque/db', async original => ({ ...await original<typeof import('@marque/db')>(), db: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => mocked.rows }) }) }), update: mocked.update }) }))
import { readCharter } from './charters'
it('repeated reads derive expiry without changing historical rows', async () => {
  const owner = `0x${'1'.repeat(40)}`
  const row: typeof table.$inferSelect = { id: 'fixture-history', provider: 'registry', chainId: 97, ownerAddress: owner,
    agentId: 'synthetic', agentName: 'Synthetic', category: 'grid', status: 'active', policy: serialiseGrant({ owner, agentId: 'synthetic', chainId: 97, expiresAt: 1, calls: [], spend: [] }),
    policyHash: `0x${'2'.repeat(64)}`, revokeHash: null, sessionKeyAddress: null, grantTxHash: null, revokeTxHash: null, verifyUrl: null,
    expiresAt: new Date(1000), grantedAt: new Date(0), revokedAt: null, callsUsed: 0, spent: {}, grantedBy: 'fixture', label: 'Synthetic history' }
  mocked.rows = [row]; const before = structuredClone(row)
  expect((await readCharter(row.id))?.status).toBe('expired')
  expect((await readCharter(row.id))?.status).toBe('expired')
  expect(row).toEqual(before); expect(mocked.update).not.toHaveBeenCalled()
})
