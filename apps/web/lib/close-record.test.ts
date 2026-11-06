import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CLOSE_FILES, CLOSE_RECORD } from './close-record'

const root = new URL('../../../docs/evidence/set-and-earn-close-2026-11-05/', import.meta.url)
describe('preserved close evidence', () => {
  it('serves every original checksummed file without changing its bytes', () => {
    const lines = readFileSync(new URL('SHA256SUMS', root), 'utf8').trimEnd().split('\n')
    for (const line of lines) {
      const [expected, file] = line.split('  ')
      expect(CLOSE_FILES as readonly string[]).toContain(file)
      expect(createHash('sha256').update(readFileSync(new URL(file!, root))).digest('hex')).toBe(expected)
    }
    expect(lines).toHaveLength(15)
  })
  it('keeps the initial film read separate from the later snapshot and its testnet timestamp', () => {
    expect(CLOSE_RECORD.figures.readAt).toBe('2026-11-05T12:00:24Z')
    expect(CLOSE_RECORD.figures.figures.find(f => f.what.startsWith('Outside jobs on BSC mainnet'))?.value).toBe(48)
    expect(CLOSE_RECORD.anchor.chainId).toBe(97)
    expect(Date.parse(CLOSE_RECORD.anchor.anchoredAt)).toBeGreaterThan(Date.parse(CLOSE_RECORD.figures.readAt))
  })
})
