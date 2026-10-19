import { describe, expect, it } from 'vitest'
import { keccak256, toBytes } from 'viem'
import { publicDeliverableResponse } from './public-deliverable.js'

describe('public delivery privacy without rewriting the original', () => {
  it('withholds an error payload and commits the exact original bytes', () => {
    const original = ' \n' + JSON.stringify({ response: { content: JSON.stringify({ error: 'request to https://rpc.invalid/private-credential failed' }) } })
    const response = publicDeliverableResponse(original)
    expect(response.status).toBe(409)
    expect(response.body).not.toContain('rpc.invalid')
    expect(response.body).not.toContain('private-credential')
    expect(JSON.parse(response.body)).toMatchObject({ originalContentHash: keccak256(toBytes(original)), originalPreserved: true })
  })
  it.each([{ recommend: false, netAprPct: 0 }, { levels: [], allocationTotalUsd: 0 }, { healthFactor: 0 }, { error: null, source: 'https://public.example/provenance' }])('keeps valid negative, zero and source evidence byte-identical: %j', content => {
    const original = JSON.stringify({ response: { content: JSON.stringify(content) } }, null, 2)
    expect(publicDeliverableResponse(original)).toEqual({ status: 200, body: original })
  })
  it('does not reinterpret other historical file formats as a new answer', () => {
    expect(publicDeliverableResponse('historical plain text')).toEqual({ status: 200, body: 'historical plain text' })
  })
})
