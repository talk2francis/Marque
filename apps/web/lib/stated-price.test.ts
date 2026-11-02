import { describe, expect, it } from 'vitest'
import { statedPrice, statedPriceDiffers } from './stated-price'

describe('price truth: the agent\'s own stated price', () => {
  it('reads only the "over <rail> for <amount> <token>" phrasing', () => {
    expect(statedPrice('Sells a placement report over x402 for 0.05 USD1.')).toEqual({ rail: 'x402', amount: '0.05', token: 'USD1' })
    expect(statedPrice('Hireable over ERC-8183 for 0.10 $U; the deliverable is written on chain.')).toEqual({ rail: 'ERC-8183', amount: '0.10', token: 'U' })
    expect(statedPrice('Costs about 5 U, maybe.')).toBeNull()
    expect(statedPrice(null)).toBeNull()
  })
  it('shows a difference only when amount, token or rail differs from the live quote', () => {
    expect(statedPriceDiffers('Hireable over ERC-8183 for 0.10 $U', '0.01 U')).toMatchObject({ amount: '0.10' })
    expect(statedPriceDiffers('Hireable over ERC-8183 for 0.10 $U', '0.1 U')).toBeNull()
    expect(statedPriceDiffers('over x402 for 0.05 USD1', '0.05 U')).toMatchObject({ rail: 'x402', token: 'USD1' })
    expect(statedPriceDiffers('No price stated here.', '0.01 U')).toBeNull()
  })
})
