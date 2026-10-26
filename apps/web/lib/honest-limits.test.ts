import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HONEST_LIMITS } from './honest-limits'

describe('/adopt states the same limits as the README', () => {
  it('every Honest limits line, word for word, and no others', () => {
    const readme = readFileSync(join(__dirname, '../../../README.md'), 'utf8')
    const sec = readme.slice(readme.indexOf('## Honest limits'), readme.indexOf('## Public APIs'))
    const items = sec.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim())
    expect([...HONEST_LIMITS]).toEqual(items)
  })
})
