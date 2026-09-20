import { describe, it, expect } from 'vitest'
import { parseChallenge } from './executors/x402.js'
import { endpointFromCard } from './executors/a2a.js'
import { extractJson, parsePriceWithAsset } from './parse.js'

describe('x402 challenge parsing', () => {
  it('reads the settlement asset from the challenge rather than assuming it', () => {
    const c = parseChallenge({}, JSON.stringify({
      x402Version: '1',
      accepts: [{ maxAmountRequired: '0.10', asset: 'USDC', network: 56, payTo: '0x1111111111111111111111111111111111111111' }],
    }))
    expect(c?.amount).toBe(0.1)
    expect(c?.asset).toBe('USDC')
    expect(c?.chainId).toBe(56)
    expect(c?.payTo).toBe('0x1111111111111111111111111111111111111111')
  })

  it('reads the header dialect too', () => {
    const c = parseChallenge(
      { 'www-authenticate': 'Payment price="0.25 USDT" address="0x2222222222222222222222222222222222222222" chainId="56"' },
      '',
    )
    expect(c?.amount).toBe(0.25)
    expect(c?.asset).toBe('USDT')
    expect(c?.payTo).toBe('0x2222222222222222222222222222222222222222')
  })

  it('returns null rather than inventing a challenge', () => {
    expect(parseChallenge({}, 'not a challenge')).toBeNull()
  })
})

describe('A2A card resolution', () => {
  it('finds the callable endpoint named inside the card', () => {
    expect(
      endpointFromCard({ name: 'x', url: 'https://api.example.com/a2a' }, 'https://api.example.com/.well-known/agent-card.json'),
    ).toBe('https://api.example.com/a2a')
  })

  it('refuses to guess when the card names no endpoint', () => {
    // Guessing produces a graded failure that blames the agent for our guess.
    // "This card names no callable endpoint" is accurate and useful; a guess
    // is neither.
    expect(
      endpointFromCard({ name: 'x' }, 'https://api.example.com/agent/.well-known/agent-card.json'),
    ).toBeNull()
  })

  it('returns null for a card that is not an object', () => {
    expect(endpointFromCard('nope', 'https://x.dev/.well-known/agent-card.json')).toBeNull()
  })
})

describe('parsing untrusted agent output', () => {
  it('unwraps a JSON-RPC envelope', () => {
    expect(extractJson({ jsonrpc: '2.0', id: 1, result: { healthFactor: 1.18 } })).toEqual({ healthFactor: 1.18 })
  })

  it('unwraps JSON from a fenced code block inside prose', () => {
    const body = 'Here is my answer:\n```json\n{ "healthFactor": 1.18 }\n```\nHope that helps.'
    expect(extractJson(body)).toEqual({ healthFactor: 1.18 })
  })

  it('digs an answer out of an A2A artifact array', () => {
    const body = { result: { artifacts: [{ parts: [{ text: '{"healthFactor": 1.18}' }] }] } }
    expect(extractJson(body)).toEqual({ healthFactor: 1.18 })
  })

  it('does not turn an error envelope into an answer', () => {
    // An error is an answer ABOUT failure, not an answer. Unwrapping it would
    // hand the grader an object to score.
    expect(extractJson({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'nope' } })).toBeNull()
  })

  it('returns null for prose with no JSON in it', () => {
    expect(extractJson('I am afraid I cannot help with that.')).toBeNull()
  })

  it('never invents a fee that was not stated', () => {
    expect(parsePriceWithAsset(null)).toBeNull()
    expect(parsePriceWithAsset('free')).toBeNull()
    expect(parsePriceWithAsset('0.15 USDC')).toEqual({ amount: 0.15, asset: 'USDC' })
  })
})
