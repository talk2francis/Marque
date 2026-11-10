import { describe, expect, it } from 'vitest'
import { grantRetryPolicy } from './charter-grant-retry'
describe('grant retries never repeat uncertain or confirmed transactions', () => {
  it('only verifies after all approvals and creation confirmed', () => expect(grantRetryPolicy(['done','done','done'])).toBe('verify'))
  it('only verifies a confirmed one-step NFT grant', () => expect(grantRetryPolicy(['done'])).toBe('verify'))
  it('waits for a pending creation after successful approvals', () => expect(grantRetryPolicy(['done','done','pending'])).toBe('wait'))
  it('waits when the wallet has not reported a result', () => expect(grantRetryPolicy(['signing','signing'])).toBe('wait'))
  it('can resume a known failed creation or start a new request', () => {
    expect(grantRetryPolicy(['done','failed'])).toBe('submit')
    expect(grantRetryPolicy(['waiting','waiting'])).toBe('submit')
  })
})
