import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, PUT } from './route'
const m = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), save: vi.fn(), limit: vi.fn() }))
vi.mock('../../../../../lib/wallet-profile', () => ({ readSession: m.session }))
vi.mock('../../../../../lib/agent-banners', () => ({ readAgentBanner: m.read, saveAgentBanner: m.save }))
vi.mock('../../../../../lib/limits', () => ({ checkClaimBurst: m.limit, clientKey: () => 'fixture' }))
const agentId = '97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2682'
const session = { address: '0x1111111111111111111111111111111111111111', message: 'proof', signature: 'proof signature' }
const request = (value: unknown) => new Request('https://marque.trade/api/v1/me/banner', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
beforeEach(() => { vi.clearAllMocks(); m.session.mockReturnValue(session); m.limit.mockReturnValue({ ok: true }); m.read.mockResolvedValue(null); m.save.mockResolvedValue({ ok: true, banner: null }) })
describe('optional banner HTTP boundary', () => {
  it('requires a valid signed session before reading a request body or writing', async () => {
    m.session.mockReturnValue(null)
    expect((await PUT(request({ agentId, dataUrl: null }))).status).toBe(401)
    expect(m.save).not.toHaveBeenCalled(); expect(m.limit).not.toHaveBeenCalled()
  })
  it('rate limits uploads before invoking ownership or storage', async () => {
    m.limit.mockReturnValue({ ok: false, detail: 'Try later.' })
    expect((await PUT(request({ agentId, dataUrl: null }))).status).toBe(429)
    expect(m.save).not.toHaveBeenCalled()
  })
  it('rejects malformed identities, extra fields and oversized bodies', async () => {
    for (const value of [{ agentId: '1:bad:1', dataUrl: null }, { agentId: agentId.replace(':2682', ':02682'), dataUrl: null }, { agentId, dataUrl: null, owner: 'someone else' }, { agentId, dataUrl: 'x'.repeat(2_120_000) }]) expect((await PUT(request(value))).status).toBe(400)
    expect(m.save).not.toHaveBeenCalled()
  })
  it('passes the verified session and canonical identity to the fresh-ownership service', async () => {
    expect((await PUT(request({ agentId, dataUrl: null }))).status).toBe(200)
    expect(m.save).toHaveBeenCalledWith(session, agentId, null)
  })
  it('retains an ownership refusal and never turns it into a successful save', async () => {
    m.save.mockResolvedValue({ ok: false, status: 403, detail: 'Ownership not confirmed.' })
    expect((await PUT(request({ agentId, dataUrl: null }))).status).toBe(403)
  })
  it('returns public presentation only and distinguishes absence from read failure', async () => {
    const url = 'https://marque.trade/api/v1/me/banner?agentId=' + encodeURIComponent(agentId)
    expect(await (await GET(new Request(url))).json()).toEqual({ banner: null })
    m.read.mockRejectedValue(new Error('private diagnostic'))
    const response = await GET(new Request(url)); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('private diagnostic')
    expect((await GET(new Request('https://marque.trade/api/v1/me/banner'))).status).toBe(400)
  })
  it('does not disclose internal database failures or confirm failed saves', async () => {
    m.save.mockRejectedValue(new Error('private diagnostic'))
    const response = await PUT(request({ agentId, dataUrl: null })); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('private diagnostic')
  })
})
