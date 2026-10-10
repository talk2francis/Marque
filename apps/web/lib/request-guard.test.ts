import { describe, expect, it } from 'vitest'
import { safeRequestPath, validRouterStateHeader } from './request-guard'
describe('request boundary', () => {
  it('allows ordinary pages and real nested navigation state', () => {
    expect(validRouterStateHeader(null)).toBe(true)
    expect(validRouterStateHeader(encodeURIComponent(JSON.stringify(['', {children:[['slug','keel','d'], {children:['__PAGE__',{}]}]}, null, 'refetch', true])))).toBe(true)
    expect(safeRequestPath('/agents/56/341556')).toBe(true)
  })
  it('rejects malformed state and control bytes before Next or Postgres', () => {
    for (const h of ['broken', '%', '{}', '[1,{}]', '["",[]]', '["",{},null,"bad"]', 'x'.repeat(40001)]) expect(validRouterStateHeader(h)).toBe(false)
    for (const p of ['/docs/x%00.jpg', '/api/v1/charters/%0a', '/%zz']) expect(safeRequestPath(p)).toBe(false)
  })
})
