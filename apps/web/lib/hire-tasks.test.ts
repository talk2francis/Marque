import { describe, expect, it } from 'vitest'
import { keelEngine, readTarget } from '../../../packages/agent-engines/src/keel'
import { parsePolicy } from '../../../packages/agent-engines/src/lattice'
import { boundEngine, readRangePct } from '../../../packages/agent-engines/src/bound'
import { parseAsk } from '../../../packages/agent-engines/src/sluicegate'
import { parseTidemark } from '../../../packages/agent-engines/src/tidemark'
import { gridTask, hfTask, rebalanceTask, yieldTask } from './hire-tasks'

const ACCOUNT = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

describe('every hire-sheet form composes a task the agent accepts', () => {
  it('health factor (Keel)', () => {
    const t = hfTask(ACCOUNT, 1.8)
    expect(keelEngine.inspect(t).missing).toEqual([])
    expect(readTarget(t).target).toBe(1.8)
  })
  it('grid (Lattice), with and without a stop', () => {
    expect(parsePolicy(gridTask({ pair: 'BNB', lower: '560.5', upper: '690', capital: '500', stop: '540', levels: 12 })))
      .toMatchObject({ lowerBound: 560.5, upperBound: 690, capitalUsd: 500, stopPrice: 540, levels: 12 })
    expect(parsePolicy(gridTask({ pair: 'ETH', lower: '3000', upper: '3600', capital: '1,200', levels: null })))
      .toMatchObject({ lowerBound: 3000, upperBound: 3600, levels: 10 })
  })
  it('rebalancing (Bound)', () => {
    const t = rebalanceTask('7367728', 5)
    expect(boundEngine.inspect(t).missing).toEqual([])
    expect(readRangePct(t)).toBe(5)
  })
  it('yield (Sluicegate and Tidemark)', () => {
    const t = yieldTask('1000', 'USDT')
    expect(parseAsk(t)).toMatchObject({ asset: 'USDT', sizeUsd: 1000 })
    expect('missing' in parseTidemark(t)).toBe(false)
  })
})
