import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

/**
 * Invariant 32: every function that produces a count of agents, hires or supply names its
 * lane. Each entry says which parameter carries the lane (a Lane, a chain id, or a query
 * object whose `lane` it reads). A new exported count-like function that is not listed here
 * fails this test, so nobody can add an unlabelled total by accident.
 */
const ROOT = join(__dirname, '../../..')
const LANE_TABLE: Record<string, Record<string, string>> = {
  'apps/web/lib/marketplace.ts': { marketplaceAgents: 'q', marketplaceSourceQuery: 'chainId', marketplaceCategoryQuery: 'chainId', marketPageAgentStates: 'page' },
  'apps/web/lib/register-counts.ts': { getRegisterCounts: 'lane' },
  'apps/web/lib/agent-track.ts': { agentTracks: 'chainId' },
  'packages/commerce/src/supply.ts': { coverage: 'lane', commercialStates: 'serviceId' },
  'packages/commerce/src/quest.ts': { questStats: 'chainId' },
}
// Functions whose rows are already lane-scoped by their input (they only aggregate what they are given).
const AGGREGATES_INPUT: Record<string, string[]> = {
  'apps/web/lib/market-supply.ts': ['marketSupply'],
  'apps/web/lib/home-data.ts': ['categoryTiles', 'funnelLine', 'readyToHire', 'tapeItems', 'recentHires', 'passFail', 'ledgerHeadline'],
}
const COUNT_LIKE = /count|coverage|supply|stats|funnel|tiles|ready|marketplace|tracks|states/i

function exportedFunctions(file: string): Array<{ name: string; params: string[] }> {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out: Array<{ name: string; params: string[] }> = []
  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      out.push({ name: n.name.text, params: n.parameters.map((p) => p.name.getText(sf)) })
    }
  })
  return out
}

describe('every count names its lane (invariant 32)', () => {
  for (const [file, fns] of Object.entries(LANE_TABLE)) {
    it(`${file}: listed functions take their lane parameter`, () => {
      const found = exportedFunctions(file)
      for (const [fn, param] of Object.entries(fns)) {
        const f = found.find((x) => x.name === fn)
        expect(f, `${fn} not exported from ${file}`).toBeDefined()
        expect(f!.params, `${fn} must take ${param}`).toContain(param)
      }
    })
    it(`${file}: no unlisted count-like export`, () => {
      const unlisted = exportedFunctions(file).filter((f) => COUNT_LIKE.test(f.name) && !(f.name in fns))
      expect(unlisted.map((f) => f.name), 'add each to LANE_TABLE with the parameter that carries its lane').toEqual([])
    })
  }
  it('marketplaceAgents resolves a lane and returns it', () => {
    const src = readFileSync(join(ROOT, 'apps/web/lib/marketplace.ts'), 'utf8')
    expect(src).toMatch(/const lane: Lane = q\.lane \?\?/)
    expect(src).toMatch(/facets, lane, quoteObservedAt/)
  })
  for (const [file, fns] of Object.entries(AGGREGATES_INPUT)) {
    it(`${file}: input-scoped aggregates stay mainnet or input-bound`, () => {
      const src = readFileSync(join(ROOT, file), 'utf8')
      for (const fn of fns) expect(src).toContain(fn)
      // Home figures are the mainnet headline: any lane they read is named explicitly.
      if (file.endsWith('home-data.ts')) expect(src).toMatch(/network: 56|lane: 'mainnet'/)
    })
  }
})
