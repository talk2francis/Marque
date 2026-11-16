import { describe, expect, it } from 'vitest'
import { capPerHost } from './schedule'

const row = (host: string, i: number, firstParty = false) => ({ url: `https://${host}/agents/${i}/card`, firstParty, i })

describe('capPerHost', () => {
  it('gives one slow host no more than its share and fills the rest from other hosts, in order', () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => row('big.example', i)), row('a.example', 100), row('b.example', 101), row('a.example', 102)]
    const out = capPerHost(rows, 6, 3)
    expect(out.map((r) => r.i)).toEqual([0, 1, 2, 100, 101, 102])
  })
  it('never caps first-party services and stops at the limit', () => {
    const rows = [row('big.example', 1, true), row('big.example', 2, true), row('big.example', 3), row('big.example', 4), row('c.example', 5)]
    expect(capPerHost(rows, 4, 1).map((r) => r.i)).toEqual([1, 2, 3, 5])
    expect(capPerHost(rows, 2, 1).map((r) => r.i)).toEqual([1, 2])
  })
  it('treats host names case-insensitively and keeps unparsable urls apart', () => {
    const rows = [{ url: 'https://BIG.example/x', firstParty: false, i: 1 }, { url: 'https://big.example/y', firstParty: false, i: 2 }, { url: 'not a url', firstParty: false, i: 3 }]
    expect(capPerHost(rows, 5, 1).map((r) => r.i)).toEqual([1, 3])
  })
})
