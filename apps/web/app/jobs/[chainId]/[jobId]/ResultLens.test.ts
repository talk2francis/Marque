import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeAnswer } from '@marque/commerce'
import type { JobLens } from '../../../../lib/lens'
import { ResultLens } from './ResultLens'
vi.mock('@marque/ui', () => ({ Limits: () => null }))
beforeEach(() => vi.stubGlobal('React', React))
afterEach(() => vi.unstubAllGlobals())
function render(content: Record<string, unknown>, inline = false) {
  const data: JobLens = {
    lens: normalizeAnswer('yield', content),
    checks: [],
    checkedAtBlock: null,
    summary: { checked: 0, agreed: 0 },
    state: 'no-check',
    reason: 'No independent rate check for this format',
    attemptedAt: '2026-10-31T12:00:00Z',
    stored: false,
    readable: true,
    terms: null,
    manifest: {
      raw: JSON.stringify(content),
      matches: true,
      hash: `0x${'1'.repeat(64)}`,
      url: 'https://bscscan.com/tx/example',
      source: inline ? 'submission_calldata' : 'agent_announced',
      hashAlgorithm: inline ? 'sha256' : 'keccak256',
    },
  }
  return renderToStaticMarkup(
    React.createElement(ResultLens, { data, agentName: 'Example agent', content }),
  )
}
describe('readable delivered results keep rate units and integrity distinct', () => {
  it('renders supply APY as a ranking without claiming a net APR or a chain rate check', () => {
    const html = render(
      {
        result: {
          plan: {
            ranked: [
              { symbol: 'vUSDT', supply_apy_pct: 4.2, available_liquidity_usd: 1000 },
              { symbol: 'vUSD', supply_apy_pct: 0, available_liquidity_usd: 0 },
            ],
          },
        },
      },
      true,
    )
    expect(html).toContain('4.20% APY')
    expect(html).toContain('0.00% APY')
    expect(html).toContain('Agent-reported supply rates')
    expect(html).toContain('Not checked:')
    expect(html).not.toContain('Checked against the chain:')
    expect(html).toContain('sha256')
    expect(html).toContain('View the submission transaction')
    expect(html).toContain('Answer matches the hash on chain')
  })
  it('does not fill missing switching costs with a zero total', () => {
    const html = render({ recommend: false, netAprPct: 0 })
    expect(html).toContain('Not fully given')
    expect(html).toContain('keccak256')
    expect(html).toContain('Download the file')
  })
  it('retains a genuine explicitly supplied zero switching total', () => {
    expect(
      render({ recommend: false, switchingCost: { gasUsd: 0, swapUsd: 0, exitUsd: 0 } }),
    ).toContain('$0.0000')
  })
})
