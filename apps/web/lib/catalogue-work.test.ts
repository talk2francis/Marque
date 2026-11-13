import { describe, expect, it } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { encodeCatalogue, mapCatalogue } from './catalogue-work'

describe('complete catalogue work without a single blocking batch', () => {
  it('preserves order and every row while a pending event-loop callback can run', async () => {
    const rows = Array.from({ length: 513 }, (_, id) => ({ id, name: `Agent ${id}` }))
    let callbackRan = false
    setImmediate(() => { callbackRan = true })
    const result = await mapCatalogue(rows, row => ({ ...row, value: row.id * 2 }))
    expect(callbackRan).toBe(true)
    expect(result).toEqual(rows.map(row => ({ ...row, value: row.id * 2 })))
  })
  it('rejects a failed projection instead of returning a partial population', async () => {
    await expect(mapCatalogue([1, 2, 3], row => { if (row === 2) throw Error('failed'); return row })).rejects.toThrow('failed')
  })
  it.each([0, 1, 128, 129, 513])('keeps the existing exact JSON bytes for %i escaped and optional rows', async length => {
    const entry = { at: 12345, rows: Array.from({ length }, (_, id) => ({ id, text: 'quote " newline\n雪', missing: undefined, value: null, nested: [1, 'a'] })) }
    expect(gunzipSync(await encodeCatalogue(entry)).toString('utf8')).toBe(JSON.stringify(entry))
  })
  it('rejects serialization failures through the stream without publishing partial bytes', async () => {
    await expect(encodeCatalogue({ at: 1, rows: [{ amount: 1n }] })).rejects.toThrow(/BigInt/)
  })
})
