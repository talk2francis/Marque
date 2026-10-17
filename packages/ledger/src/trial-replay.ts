import { z } from 'zod'
import { hashContent } from './manifest.js'

const digest = z.string().regex(/^0x[0-9a-f]{64}$/)
const text = z.string().min(1).max(65_536)
const timestamp = z.string().datetime()
const assertion = z.object({
  // Own properties only; no executable rubric, coercion or financial judgement.
  path: z.array(z.string().min(1).max(100)).min(1).max(8),
  equals: z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]),
}).strict()
export const trialContextSchema = z.object({
  schema: z.literal('marque.trial-context.v1'),
  task: text, input: text, policy: text,
  chainId: z.union([z.literal(56), z.literal(97)]),
  block: z.string().regex(/^[1-9]\d{0,30}$/), blockHash: digest,
  registeredAt: timestamp,
  rubric: z.object({ version: z.literal(1), assertions: z.array(assertion).min(1).max(64) }).strict(),
}).strict()
export const trialReplaySchema = z.object({
  schema: z.literal('marque.trial-replay.v1'),
  provenance: z.enum(['SYNTHETIC_FIXTURE', 'UNVERIFIED_CAPTURE']),
  context: trialContextSchema,
  runs: z.array(z.object({
    agentId: z.string().min(1).max(200), serviceId: z.number().int().positive(),
    provider: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    independence: z.enum(['UNKNOWN', 'FIRST_PARTY', 'UNVERIFIED_OPERATOR_CLAIM']),
    consent: z.enum(['UNKNOWN', 'RECORDED_NOT_AUTHENTICATED']),
    sideEffects: z.enum(['UNKNOWN', 'DECLARED_READ_ONLY']),
    rep: z.number().int().min(1).max(100),
    contextHash: digest, observedBlockHash: digest,
    startedAt: timestamp, elapsedMs: z.number().finite().nonnegative().nullable(),
    cost: z.object({ amountRaw: z.string().regex(/^(0|[1-9]\d{0,77})$/), token: z.string().regex(/^0x[0-9a-fA-F]{40}$/), decimals: z.number().int().min(0).max(255) }).strict().nullable(),
    outcome: z.enum(['OUTPUT', 'TIMEOUT', 'ERROR']), outputText: text.nullable(),
  }).strict()).max(200),
}).strict()

export function trialContextHash(value: unknown): string {
  return hashContent(trialContextSchema.parse(value))
}

/** Offline inspection only. Caller claims are never promoted to provider consent,
 * operator independence, authentic timing, payment or a comparative winner. */
export function replayTrial(value: unknown) {
  const input = trialReplaySchema.parse(value)
  const contextHash = trialContextHash(input.context)
  const seen = new Set<string>()
  const runs = input.runs.map(run => {
    const reasons: string[] = []
    const key = `${run.agentId}/${run.serviceId}/${run.rep}`
    if (seen.has(key)) reasons.push('duplicate_repetition')
    seen.add(key)
    if (run.contextHash !== contextHash) reasons.push('different_frozen_context')
    if (run.observedBlockHash !== input.context.blockHash) reasons.push('different_chain_fork')
    if (Date.parse(run.startedAt) <= Date.parse(input.context.registeredAt)) reasons.push('rubric_not_preregistered')
    let output: unknown
    if (run.outcome !== 'OUTPUT') reasons.push(run.outcome.toLowerCase())
    else {
      try { output = JSON.parse(run.outputText ?? '') as unknown }
      catch { reasons.push('invalid_json_output') }
    }
    const assertions = input.context.rubric.assertions.map(rule => {
      let actual: unknown = output
      for (const key of rule.path) {
        actual = actual !== null && typeof actual === 'object' && Object.hasOwn(actual, key)
          ? (actual as Record<string, unknown>)[key] : undefined
      }
      return { path: rule.path, pass: actual === rule.equals }
    })
    return {
      agentId: run.agentId, serviceId: run.serviceId, provider: run.provider, rep: run.rep,
      outputHash: run.outputText === null ? null : hashContent(run.outputText),
      contextHash: run.contextHash, reasons, assertions,
      replayPass: reasons.length === 0 && assertions.every(a => a.pass),
      elapsedMs: run.elapsedMs, cost: run.cost,
      independence: run.independence, consent: run.consent, sideEffects: run.sideEffects,
    }
  })
  return {
    schema: 'marque.trial-report.v1' as const, provenance: input.provenance,
    contextHash, taskHash: hashContent(input.context.task), inputHash: hashContent(input.context.input),
    policyHash: hashContent(input.context.policy), rubricHash: hashContent(input.context.rubric),
    context: input.context, runs,
    sampleSize: runs.length,
    passingReplaySamples: runs.filter(r => r.replayPass).length,
    comparison: 'UNPROVEN' as const, winner: null,
    limitations: [
      'Offline replay; no provider contacted and no task executed.',
      'Context, consent, control, timing and costs are unauthenticated caller claims.',
      'Exact JSON value assertions test stated facts only, not financial judgement.',
      'No latency, cost, quality or provider ranking; historical unequal inputs are not comparable.',
    ],
  }
}
