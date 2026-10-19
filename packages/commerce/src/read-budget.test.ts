import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { boundedCommerceRead, coalescedCatalogRead } from './read-budget'

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('@marque/db', () => ({ db: () => mocks }))

function reads(finalRead: () => Promise<unknown>) {
  mocks.transaction.mockImplementation(async (callback: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    let step = 0
    return callback({ execute: vi.fn(async () => ++step <= 3 ? [] : finalRead()) })
  })
}

describe('pending catalog read coalescing', () => {
  beforeEach(() => { mocks.transaction.mockReset() })

  it('shares one pending identical read and starts a new read after it settles', async () => {
    let resolve!: (rows: Array<Record<string, unknown>>) => void
    const pending = new Promise<Array<Record<string, unknown>>>(done => { resolve = done })
    reads(() => pending)
    const first = coalescedCatalogRead(sql`select ${'same identity'}`)
    const second = coalescedCatalogRead(sql`select ${'same identity'}`)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    resolve([{ observation: 'first read' }])
    expect(await Promise.all([first, second])).toEqual([[{ observation: 'first read' }], [{ observation: 'first read' }]])
    reads(async () => [{ observation: 'new read' }])
    expect(await coalescedCatalogRead(sql`select ${'same identity'}`)).toEqual([{ observation: 'new read' }])
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })
  it('does not share different identity parameters', async () => {
    reads(async () => [])
    await Promise.all([coalescedCatalogRead(sql`select ${'identity A'}`), coalescedCatalogRead(sql`select ${'identity B'}`)])
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })
  it('keeps exact-service observations independent even when their queries match', async () => {
    reads(async () => [])
    await Promise.all([boundedCommerceRead(sql`select ${1}`, 'exact'), boundedCommerceRead(sql`select ${1}`, 'exact')])
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })
  it('shares a failure with current callers then allows a fresh retry', async () => {
    reads(async () => { throw Error('synthetic bounded read failure') })
    const results = await Promise.allSettled([coalescedCatalogRead(sql`select ${'retry'}`), coalescedCatalogRead(sql`select ${'retry'}`)])
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    reads(async () => [{ recovered: true }])
    expect(await coalescedCatalogRead(sql`select ${'retry'}`)).toEqual([{ recovered: true }])
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })
  it('keeps complex driver parameters out of the shared key', async () => {
    reads(async () => [])
    const bytes = new Uint8Array([1, 2])
    await Promise.all([coalescedCatalogRead(sql`select ${bytes}`), coalescedCatalogRead(sql`select ${bytes}`)])
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })
})
