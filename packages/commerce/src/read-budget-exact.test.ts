import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sql, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocked = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('@marque/db', () => ({ db: () => ({ transaction: mocked.transaction }) }))
import { coalescedExactRead, coalescedCatalogRead } from './read-budget'
const dialect = new PgDialect()
let statements: string[]
function fixture(result: Promise<unknown>) {
  mocked.transaction.mockImplementation(async (fn: (tx: { execute: (q: SQL) => Promise<unknown> }) => Promise<unknown>) => fn({ execute: async q => {
    const text = dialect.sqlToQuery(q).sql
    statements.push(text)
    return text.startsWith('select') ? result : []
  } }))
}
beforeEach(() => { mocked.transaction.mockReset(); statements = [] })
describe('overlapping exact database reads', () => {
  it('shares concurrent work, then performs a fresh read after completion', async () => {
    let release!: (value: unknown) => void
    fixture(new Promise(resolve => { release = resolve }))
    const query = sql`select ${'same'} as value`
    const first = coalescedExactRead(query), second = coalescedExactRead(query)
    expect(mocked.transaction).toHaveBeenCalledTimes(1)
    release([{ value: 'same' }])
    expect(await first).toEqual(await second)
    await coalescedExactRead(query)
    expect(mocked.transaction).toHaveBeenCalledTimes(2)
    expect(statements).toContain('set transaction read only')
    expect(statements).toContain("set local statement_timeout = '4000ms'")
    expect(statements).toContain("set local lock_timeout = '500ms'")
  })
  it('drops a failed flight so a later read can recover', async () => {
    fixture(Promise.resolve([]))
    mocked.transaction.mockRejectedValueOnce(new Error('read failed'))
    await expect(coalescedExactRead(sql`select ${'retry'}`)).rejects.toThrow('read failed')
    await expect(coalescedExactRead(sql`select ${'retry'}`)).resolves.toEqual([])
    expect(mocked.transaction).toHaveBeenCalledTimes(2)
  })
  it('keeps different parameters and catalog budgets separate', async () => {
    let release!: (value: unknown) => void
    fixture(new Promise(resolve => { release = resolve }))
    const reads = [coalescedExactRead(sql`select ${1}`), coalescedExactRead(sql`select ${'1'}`), coalescedCatalogRead(sql`select ${1}`)]
    expect(mocked.transaction).toHaveBeenCalledTimes(3)
    release([])
    await Promise.all(reads)
    expect(statements).toContain("set local statement_timeout = '4000ms'")
    expect(statements).toContain("set local statement_timeout = '8000ms'")
  })
})
