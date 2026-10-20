import { describe, expect, it } from 'vitest'
import { uriEventRange } from './registry-services'
describe('registry URI change cursor', () => {
  it('starts with a disclosed recent bootstrap window and a confirmation margin', () => {
    expect(uriEventRange(null, 2000n)).toEqual({fromBlock:989n,toBlock:1988n})
  })
  it('continues contiguously in bounded windows even after downtime', () => {
    expect(uriEventRange(100n, 5000n)).toEqual({fromBlock:101n,toBlock:1100n})
    expect(uriEventRange(1100n, 5000n)).toEqual({fromBlock:1101n,toBlock:2100n})
  })
  it('waits at the confirmed head or a temporarily lagging RPC without rewinding', () => {
    expect(uriEventRange(1988n, 2000n)).toBeNull()
    expect(uriEventRange(1990n, 2000n)).toBeNull()
    expect(uriEventRange(null, 5n)).toEqual({fromBlock:0n,toBlock:0n})
  })
})
