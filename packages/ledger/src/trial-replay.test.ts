import { describe, expect, it } from 'vitest'
import { replayTrial, trialContextHash } from './trial-replay.js'

export const fixture = () => {
  const context = {
    schema: 'marque.trial-context.v1', task: 'Synthetic arithmetic only: return the sum of 2 and 3.',
    input: '{"a":2,"b":3}', policy: 'No network, payment, signer or external action.', chainId: 97,
    block: '1', blockHash: `0x${'1'.repeat(64)}`, registeredAt: '2026-10-17T00:00:00.000Z',
    rubric: { version: 1, assertions: [{ path: ['sum'], equals: 5 }] },
  }
  const run = {
    agentId: 'synthetic-a', serviceId: 1, provider: `0x${'1'.repeat(40)}`, independence: 'UNKNOWN',
    consent: 'UNKNOWN', sideEffects: 'UNKNOWN', rep: 1, contextHash: trialContextHash(context),
    observedBlockHash: context.blockHash, startedAt: '2026-10-17T00:00:01.000Z', elapsedMs: null,
    cost: null, outcome: 'OUTPUT', outputText: '{"sum":5}',
  }
  return { schema: 'marque.trial-replay.v1', provenance: 'SYNTHETIC_FIXTURE', context,
    runs: [run, { ...run, agentId: 'synthetic-b', serviceId: 2, provider: `0x${'2'.repeat(40)}`, outputText: '{"sum":6}' }] }
}

describe('offline same-context replay never manufactures fair comparison', () => {
  it('retains both passing and failing outputs, without winner or measured cost', () => {
    const r = replayTrial(fixture())
    expect(r).toMatchObject({ comparison: 'UNPROVEN', winner: null, sampleSize: 2, passingReplaySamples: 1 })
    expect(r.runs.map(x => x.replayPass)).toEqual([true, false])
    expect(r.runs[0]?.elapsedMs).toBeNull()
    expect(r.runs[0]?.cost).toBeNull()
    expect(r.runs[0]?.outputHash).not.toEqual(r.runs[1]?.outputHash)
  })
  it.each(['task', 'input', 'policy'] as const)('rejects changed frozen %s against original commitment', key => {
    const f = fixture(); f.context[key] += ' changed'
    expect(replayTrial(f).runs.every(r => r.reasons.includes('different_frozen_context'))).toBe(true)
  })
  it('detects rubric drift and wrong fork', () => {
    const f = fixture(); f.context.rubric.assertions[0]!.equals = 6; f.runs[0]!.observedBlockHash = `0x${'2'.repeat(64)}`
    expect(replayTrial(f).runs[0]?.reasons).toEqual(['different_frozen_context', 'different_chain_fork'])
  })
  it('rejects retrospective registration and duplicate repetition', () => {
    const f = fixture(); f.runs[0]!.startedAt = f.context.registeredAt; f.runs.push({ ...f.runs[0]! })
    const r = replayTrial(f)
    expect(r.runs[0]?.reasons).toContain('rubric_not_preregistered')
    expect(r.runs[2]?.reasons).toContain('duplicate_repetition')
  })
  it.each(['TIMEOUT', 'ERROR'])('keeps %s failure visible', outcome => {
    const f = fixture(); f.runs[0]!.outcome = outcome; f.runs[0]!.outputText = '{"sum":5}'
    expect(replayTrial(f).runs[0]).toMatchObject({ replayPass: false, reasons: [outcome.toLowerCase()] })
  })
  it.each(['{', '{"sum":"5"}', '{"other":5}', '{"sum":null}'])('does not coerce or forgive missing/bad output %s', output => {
    const f = fixture(); f.runs[0]!.outputText = output
    expect(replayTrial(f).runs[0]?.replayPass).toBe(false)
  })
  it('does not traverse inherited properties', () => {
    const f = fixture(); f.context.rubric.assertions = [{ path: ['toString'], equals: 5 }]
    f.runs.forEach(r => { r.contextHash = trialContextHash(f.context) })
    expect(replayTrial(f).passingReplaySamples).toBe(0)
  })
  it('rejects invented independence, unsupported chain, huge output and hidden fields', () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => { f.runs[0]!.independence = 'VERIFIED' },
      (f: ReturnType<typeof fixture>) => { f.context.chainId = 1 },
      (f: ReturnType<typeof fixture>) => { f.runs[0]!.outputText = 'x'.repeat(65_537) },
    ]) { const f = fixture(); change(f); expect(() => replayTrial(f)).toThrow() }
    expect(() => replayTrial({ ...fixture(), execute: true })).toThrow()
  })
  it('same input produces identical report, including empty supply', () => {
    expect(replayTrial(fixture())).toEqual(replayTrial(fixture()))
    const f = fixture(); f.runs = []; expect(replayTrial(f)).toMatchObject({ comparison: 'UNPROVEN', sampleSize: 0, winner: null })
  })
})
