import { describe, expect, it } from 'vitest'
import { comparisonIds, selectedAgentRows } from './compare-selection'

describe('comparison selection', () => {
  it('deduplicates and bounds already-decoded input without URI errors', () => {
    expect(comparisonIds(' a,a, b,c,d ')).toEqual(['a','b','c'])
    expect(comparisonIds('%broken')).toEqual(['%broken'])
    expect(comparisonIds(['a','b'])).toEqual([])
    expect(comparisonIds('a'.repeat(2049))).toEqual([])
    expect(comparisonIds('a\u0000,b')).toEqual(['b'])
  })
  it('selects exact agents before enrichment, including beyond the first page', () => {
    const rows = Array.from({length:400},(_,i)=>({agentId:String(i)}))
    expect(selectedAgentRows(rows,['399','2'])).toEqual([{agentId:'2'},{agentId:'399'}])
    expect(selectedAgentRows(rows,[])).toEqual([])
  })
})
