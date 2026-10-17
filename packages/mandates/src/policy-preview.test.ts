import { describe, expect, it } from 'vitest'
import { encodeFunctionData } from 'viem'
import { inspectPolicyAttempt } from './policy-preview.js'

const owner = `0x${'1'.repeat(40)}`, recipient = `0x${'2'.repeat(40)}`, token = `0x${'3'.repeat(40)}`
const hash = `0x${'4'.repeat(64)}`
const fixture = () => ({ schema: 'marque.policy-preview-input.v1', asOf: 1000,
  policy: { chainId: 97, owner, account: owner, target: recipient, selector: '0x', recipient, asset: 'native', capRaw: '100', expiresAt: 1100 },
  state: { chainId: 97, owner, account: owner, spentRaw: '20', revoked: false, readAt: 999, blockHash: hash, expectedBlockHash: hash },
  attempt: { chainId: 97, from: owner, to: recipient, data: '0x', valueRaw: '80' },
})
const erc20 = () => {
  const f = fixture(); f.policy.target = token; f.policy.asset = token; f.policy.selector = '0xa9059cbb'
  f.attempt.to = token; f.attempt.valueRaw = '0'
  f.attempt.data = encodeFunctionData({ abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'transfer', args: [recipient as `0x${string}`, 80n] })
  return f
}
describe('read-only proposed action boundaries, never a session or signer', () => {
  it.each([fixture, erc20])('a matching decoded action still cannot execute or claim enforcement', make => {
    expect(inspectPolicyAttempt(make())).toMatchObject({ policyCheck: 'WITHIN_PROPOSED_BOUNDS', executionAllowed: false, authority: 'NONE', signerProof: 'NOT_VERIFIED', simulation: 'NOT_RUN', onchainEnforcement: 'NOT_PROVEN' })
  })
  it.each(['chain', 'owner', 'account', 'signer', 'fork', 'old', 'future', 'revoked', 'expired', 'target', 'selector', 'asset', 'cap'])(
    'denies %s deterministically', kind => {
      const f = fixture()
      if (kind === 'chain') f.attempt.chainId = 56
      if (kind === 'owner') f.state.owner = recipient
      if (kind === 'account') f.state.account = recipient
      if (kind === 'signer') f.attempt.from = recipient
      if (kind === 'fork') f.state.expectedBlockHash = `0x${'5'.repeat(64)}`
      if (kind === 'old') f.state.readAt = 969
      if (kind === 'future') f.state.readAt = 1006
      if (kind === 'revoked') f.state.revoked = true
      if (kind === 'expired') f.policy.expiresAt = 1000
      if (kind === 'target') f.attempt.to = token
      if (kind === 'selector') f.policy.selector = '0xa9059cbb'
      if (kind === 'asset') f.policy.asset = token
      if (kind === 'cap') f.attempt.valueRaw = '81'
      const r = inspectPolicyAttempt(f)
      expect(r.policyCheck).toBe('DENIED'); expect(r.executionAllowed).toBe(false)
      expect(inspectPolicyAttempt(f)).toEqual(r)
    },
  )
  it('decodes recipients and amounts from actual calldata, not parallel claimed fields', () => {
    const f = erc20(); f.policy.recipient = owner
    expect(inspectPolicyAttempt(f).reason).toBe('outside_recipient')
    f.policy.recipient = recipient; f.attempt.valueRaw = '1'
    expect(inspectPolicyAttempt(f).reason).toBe('unexpected_native_value')
  })
  it('denies approvals, arbitrary selectors, malformed calldata and trailing bytes', () => {
    for (const data of ['0x095ea7b3', '0xdeadbeef', '0xa9059cbb', erc20().attempt.data + '00']) {
      const f = erc20(); f.attempt.data = data
      expect(inspectPolicyAttempt(f).policyCheck).toBe('DENIED')
    }
  })
  it('does not round caps above Number precision or silently add fee headroom', () => {
    const f = fixture(); f.policy.capRaw = '9007199254740993'; f.state.spentRaw = '9007199254740992'; f.attempt.valueRaw = '1'
    expect(inspectPolicyAttempt(f).policyCheck).toBe('WITHIN_PROPOSED_BOUNDS')
    f.attempt.valueRaw = '2'; expect(inspectPolicyAttempt(f).reason).toBe('over_cap')
  })
  it('changed supplied state invalidates the prior preview; no TOCTOU authorization survives', () => {
    const f = fixture(); const before = structuredClone(f)
    expect(inspectPolicyAttempt(f).executionAllowed).toBe(false)
    f.state.revoked = true; expect(inspectPolicyAttempt(f).reason).toBe('revoked_in_supplied_state')
    expect(before.state.revoked).toBe(false)
  })
  it('rejects wildcards, periods, negative amounts, extra claims and unsupported network', () => {
    for (const value of [{ ...fixture(), nativeSessionVerified: true }, { ...fixture(), attempt: { ...fixture().attempt, valueRaw: '-1' } }, { ...fixture(), policy: { ...fixture().policy, selector: '*', period: 'day' } }, { ...fixture(), policy: { ...fixture().policy, chainId: 1 } }]) {
      expect(inspectPolicyAttempt(value)).toMatchObject({ policyCheck: 'DENIED', reason: 'invalid_input', executionAllowed: false })
    }
  })
})
