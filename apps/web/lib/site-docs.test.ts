import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { siteDocs } from './site-docs'

describe('docs/site mirrors the website', () => {
  for (const f of siteDocs()) {
    it(`${f.path} matches its source (run pnpm site-docs)`, () => {
      expect(readFileSync(join(__dirname, '../../../docs/site', f.path), 'utf8')).toBe(f.content)
    })
  }
})
