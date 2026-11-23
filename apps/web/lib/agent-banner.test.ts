import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { PgDialect } from 'drizzle-orm/pg-core'
import { saveAgentBanner } from './agent-banners'
import { storeImage } from './wallet-profile'
import { BANNER_SIZE } from './agent-banner-model'

const mocked = vi.hoisted(() => ({ execute: vi.fn(), readContract: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: () => ({ execute: mocked.execute }) }))
const purged = vi.hoisted(() => ({ paths: [] as string[] }))
vi.mock('./edge-purge', () => ({ purgeEdge: async (paths: readonly string[]) => { purged.paths.push(...paths) } }))
vi.mock('@marque/commerce', async original => ({ ...await original<object>(), chainClient: () => ({ readContract: mocked.readContract }) }))
const owner = '0x1111111111111111111111111111111111111111', other = '0x2222222222222222222222222222222222222222'
const agentId = '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:99'
const session = { address: owner, message: 'fixture owner proof', signature: 'fixture signature' }
const dialect = new PgDialect()
/** A structurally complete PNG (IHDR, IDAT, IEND) of `size` bytes: uploads are now rebuilt from their chunks. */
function png(width: number = BANNER_SIZE.width, height: number = BANNER_SIZE.height, size = 64) {
  const b = new Uint8Array(Math.max(size, 57))
  const v = new DataView(b.buffer)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  v.setUint32(16, width); v.setUint32(20, height); b[24] = 8; b[25] = 2
  const idatLen = b.length - 33 - 12 - 12
  v.setUint32(33, idatLen); b.set([0x49, 0x44, 0x41, 0x54], 37)
  const iend = 33 + 12 + idatLen
  v.setUint32(iend, 0); b.set([0x49, 0x45, 0x4e, 0x44], iend + 4)
  return b
}
const data = (bytes: Uint8Array) => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64')
beforeEach(() => { vi.clearAllMocks(); mocked.readContract.mockResolvedValue(owner); mocked.execute.mockResolvedValue([{ set_at: '2026-11-07T12:00:00Z' }]) })

describe('owner banner authority and image storage', () => {
  it('refuses a different current owner before storing any image', async () => {
    mocked.readContract.mockResolvedValue(other)
    expect(await saveAgentBanner(session, agentId, data(png()))).toMatchObject({ ok: false, status: 403 })
    expect(mocked.readContract).toHaveBeenCalledOnce(); expect(mocked.execute).not.toHaveBeenCalled()
  })
  it('rechecks ownership after transfer and refuses the former owner', async () => {
    expect(await saveAgentBanner(session, agentId, data(png()))).toMatchObject({ ok: true })
    mocked.readContract.mockResolvedValue(other); mocked.execute.mockClear()
    expect(await saveAgentBanner(session, agentId, null)).toMatchObject({ ok: false, status: 403 })
    expect(mocked.readContract).toHaveBeenCalledTimes(2); expect(mocked.execute).not.toHaveBeenCalled()
  })
  it('cannot authorize an arbitrary contract that reports a convenient owner', async () => {
    expect(await saveAgentBanner(session, '56:' + other + ':99', data(png()))).toMatchObject({ ok: false, status: 403 })
    expect(mocked.readContract).not.toHaveBeenCalled(); expect(mocked.execute).not.toHaveBeenCalled()
  })
  it('fails closed on an unavailable ownership read', async () => {
    mocked.readContract.mockRejectedValue(new Error('read unavailable'))
    expect(await saveAgentBanner(session, agentId, data(png()))).toMatchObject({ ok: false, status: 403 })
    expect(mocked.execute).not.toHaveBeenCalled()
  })
  it('refuses a square, oversized image or active document without storing it', async () => {
    for (const value of [data(png(512, 512)), data(png(960, 320, 1_500_001)), 'data:image/svg+xml;base64,PHN2Zy8+']) {
      expect(await saveAgentBanner(session, agentId, value)).toMatchObject({ ok: false, status: 400 })
    }
    expect(mocked.execute).not.toHaveBeenCalled()
  })
  it('retains the original portrait hash while isolating identical banners by owner', async () => {
    const bytes = png(), portrait = await storeImage(owner, data(bytes)), first = await storeImage(owner, data(bytes), 'agent-banner'), second = await storeImage(other, data(bytes), 'agent-banner')
    expect(portrait.ok && portrait.id).toBe(createHash('sha256').update(bytes).digest('hex').slice(0, 32))
    expect(first.ok && first.id).not.toBe(second.ok && second.id)
    expect((await storeImage(owner, data(bytes), 'agent-banner'))).toEqual(first)
  })
  it('stores the owner proof and returns the confirmed presentation metadata', async () => {
    const result = await saveAgentBanner(session, agentId, data(png()))
    expect(result).toMatchObject({ ok: true, banner: { width: 960, height: 320, updatedAt: '2026-11-07T12:00:00.000Z' } })
    // The per-wallet image count, the image insert, the banner pointer, then the delayed sweep of replaced images.
    expect(mocked.execute).toHaveBeenCalledTimes(4)
    expect(dialect.sqlToQuery(mocked.execute.mock.calls[3]![0]).sql).toContain('now() -')
    expect(purged.paths).toContain('/img/art/56/0x8004a169fb4a3325136eb29fa0ceb6d2e539a432/99/banner')
    expect(result.ok && result.banner?.url).toBe('/img/art/56/0x8004a169fb4a3325136eb29fa0ceb6d2e539a432/99/banner')
    expect(dialect.sqlToQuery(mocked.execute.mock.calls[0]![0]).sql).toContain('count(*)')
    const query = dialect.sqlToQuery(mocked.execute.mock.calls[2]![0])
    expect(query.sql).toContain('insert into agent_banner'); expect(query.params).toContain(session.message); expect(query.params).toContain(session.signature)
  })
  it('clears the presentation pointer without deleting the image or any history', async () => {
    expect(await saveAgentBanner(session, agentId, null)).toEqual({ ok: true, banner: null })
    // The pointer write deletes nothing. The sweep that follows only removes this owner's images that nothing uses
    // and that are over an hour old, so a page cached before the change never shows a broken image.
    expect(mocked.execute).toHaveBeenCalledTimes(2)
    const query = dialect.sqlToQuery(mocked.execute.mock.calls[0]![0])
    expect(query.sql).not.toMatch(/delete|truncate|drop/i); expect(query.params).toContain(null)
    const sweep = dialect.sqlToQuery(mocked.execute.mock.calls[1]![0])
    expect(sweep.sql).toMatch(/delete from profile_image/); expect(sweep.params).toContain('1 hour')
    for (const ref of ['agent_portrait', 'agent_banner', 'wallet_profile']) expect(sweep.sql).toContain(ref)
  })
  it('never reports success for a failed or unconfirmed database write', async () => {
    mocked.execute.mockRejectedValue(new Error('write unavailable'))
    await expect(saveAgentBanner(session, agentId, null)).rejects.toThrow()
    mocked.execute.mockResolvedValue([])
    await expect(saveAgentBanner(session, agentId, null)).rejects.toThrow('not confirmed')
  })
})
