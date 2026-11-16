import { describe, expect, it, vi } from 'vitest'

vi.mock('./sessions.js', () => ({ sessionGrantQueue: vi.fn(), sessionRevokeQueue: vi.fn() }))
vi.mock('./v2/keys.js', () => ({ v2GrantQueue: vi.fn(), v2RevokeQueue: vi.fn() }))

import { anyKeyWork, pendingKeyWork, type KeyQueues } from './pending.js'

const queues = (rows: Partial<Record<keyof KeyQueues, Record<number, number>>>): KeyQueues & { asked: string[] } => {
  const asked: string[] = []
  const read = (name: keyof KeyQueues) => async (chainId: number) => { asked.push(`${name}:${chainId}`); return Array.from({ length: rows[name]?.[chainId] ?? 0 }, () => ({})) }
  return { asked, v1Grants: read('v1Grants'), v1Revokes: read('v1Revokes'), v2Grants: read('v2Grants'), v2Revokes: read('v2Revokes') }
}

describe('whether a key pass is needed', () => {
  it('finds nothing when every queue on every chain is empty', async () => {
    const q = queues({})
    const pending = await pendingKeyWork([56, 97], () => true, q)
    expect(anyKeyWork(pending)).toBe(false)
    expect(q.asked.sort()).toEqual(['v1Grants:56', 'v1Grants:97', 'v1Revokes:56', 'v1Revokes:97', 'v2Grants:56', 'v2Grants:97', 'v2Revokes:56', 'v2Revokes:97'])
  })

  it.each([
    ['a new v1 guard to grant', { v1Grants: { 97: 1 } }],
    ['a v1 session to revoke', { v1Revokes: { 56: 1 } }],
    ['a v2 charter to grant, retry or record', { v2Grants: { 56: 2 } }],
    ['a v2 session to revoke or confirm', { v2Revokes: { 97: 1 } }],
  ] as const)('runs the pass for %s on either chain', async (_name, rows) => {
    expect(anyKeyWork(await pendingKeyWork([56, 97], () => true, queues(rows)))).toBe(true)
  })

  it('reads v2 only where v2 is deployed, as the pass does', async () => {
    const q = queues({ v2Grants: { 56: 3 } })
    const pending = await pendingKeyWork([56, 97], (c) => c === 97, q)
    expect(anyKeyWork(pending)).toBe(false)
    expect(q.asked.filter((a) => a.startsWith('v2'))).toEqual(['v2Grants:97', 'v2Revokes:97'])
  })

  it('does not hide a database failure: the caller then runs the pass as before', async () => {
    const q = queues({})
    q.v1Revokes = async () => { throw new Error('connection refused') }
    await expect(pendingKeyWork([56], () => true, q)).rejects.toThrow('connection refused')
  })
})
