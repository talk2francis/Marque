import { beforeAll, describe, expect, it, vi } from 'vitest'

beforeAll(() => { process.env['MARQUE_ACTION_SECRET'] = 'test-secret-with-enough-entropy' })

describe('charter control capabilities', () => {
  it('binds control to the exact charter and agent', async () => {
    vi.resetModules()
    const { issueCharterCapability, verifyCharterCapability } = await import('./charter-capability')
    const token = issueCharterCapability('charter-a', 'agent-x', new Date(Date.now() + 60_000).toISOString())
    expect(verifyCharterCapability(token, 'charter-a', 'agent-x')).toBe(true)
    expect(verifyCharterCapability(token, 'charter-b', 'agent-x')).toBe(false)
    expect(verifyCharterCapability(token, 'charter-a', 'agent-y')).toBe(false)
    expect(verifyCharterCapability(`${token}tampered`, 'charter-a', 'agent-x')).toBe(false)
  })

  it('rejects an expired capability', async () => {
    vi.resetModules()
    const { issueCharterCapability, verifyCharterCapability } = await import('./charter-capability')
    const token = issueCharterCapability('charter-a', 'agent-x', new Date(Date.now() - 10 * 60_000).toISOString())
    expect(verifyCharterCapability(token, 'charter-a', 'agent-x')).toBe(false)
  })
})
