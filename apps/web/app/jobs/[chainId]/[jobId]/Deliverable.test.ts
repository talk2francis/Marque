import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeliverableView } from './Deliverable'
vi.mock('@marque/ui', () => ({ ProvenanceChip: () => null, MeasureRule: () => null }))
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { vi.unstubAllGlobals() })
const render = (category: string, content: Record<string, unknown>) => renderToStaticMarkup(React.createElement(DeliverableView, { category, content }))
describe('category results do not invent answers from errors or missing fields', () => {
  it.each(['yield', 'rebalancing', 'grid', 'health_factor', 'security'])('shows terminal errors explicitly for %s without exposing provider details', category => {
    const html = render(category, { error: 'https://rpc.invalid/private-credential' })
    expect(html).toContain('Agent reported an error')
    expect(html).not.toMatch(/Stay put|Out of range|0 levels|private-credential|rpc.invalid/)
  })
  it('keeps missing recommendation separate from an explicit decision to stay put', () => {
    expect(render('yield', {})).toContain('Not given')
    expect(render('yield', {})).not.toContain('Stay put')
    const negative = render('yield', { recommend: false, netAprPct: 0, sizeUsd: 0 })
    expect(negative).toContain('Stay put'); expect(negative).toContain('0.00%')
  })
  it('does not call a position out of range when the agent did not report its state', () => {
    expect(render('rebalancing', {})).not.toContain('Out of range')
    expect(render('rebalancing', { inRange: false })).toContain('Out of range')
    expect(render('rebalancing', { inRange: true })).toContain('In range')
  })
  it('distinguishes missing or malformed grid levels from an explicit empty grid', () => {
    for (const content of [{}, { levels: [null] }, { levels: [{}] }]) {
      const html = render('grid', content); expect(html).toContain('Levels not given'); expect(html).not.toContain('0 levels')
    }
    expect(render('grid', { levels: [] })).toContain('0 levels')
  })
  it('bounds malformed ranking and source entries without crashing', () => {
    expect(() => render('yield', { recommend: false, ranking: [null, {}, []], aprSources: [null, {}, []] })).not.toThrow()
  })
})
