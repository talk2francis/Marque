/**
 * Provenance, enforced by the type system.
 *
 * AGENTS.md invariant 5: every displayed metric carries provenance, and an
 * unverified provider claim must never look like a chain-derived fact.
 *
 * The mechanism is a branded wrapper. A bare `number` cannot be assigned to a
 * `Q`, so a reader physically cannot return a number without saying where it
 * came from. The only way to make one is through the four constructors below,
 * each of which demands the evidence that tier requires.
 */

export const PROVENANCE = ['ONCHAIN', 'MEASURED', 'TESTED', 'CLAIMED'] as const
export type Provenance = (typeof PROVENANCE)[number]

declare const brand: unique symbol

/** A quantity that knows where it came from. */
export interface Q<P extends Provenance = Provenance> {
  readonly [brand]: 'Q'
  readonly value: number
  readonly provenance: P
  /** Display unit, e.g. 'USD', 'BNB', '%', 'HF'. */
  readonly unit: string
  /** Where the number came from. Required for anything not read from chain. */
  readonly source?: string
  /** When it was true. ISO 8601. */
  readonly at?: string
}

function make<P extends Provenance>(
  value: number,
  provenance: P,
  unit: string,
  source?: string,
  at?: string,
): Q<P> {
  if (!Number.isFinite(value)) {
    // A NaN reaching the UI would render as a fabricated-looking blank.
    // Fail at the source instead, where the cause is still visible.
    throw new Error(`Q: refusing to build a non-finite ${provenance} value (unit=${unit})`)
  }
  return { value, provenance, unit, ...(source ? { source } : {}), ...(at ? { at } : {}) } as Q<P>
}

/**
 * Read directly from chain state, or computed purely from values that were.
 * The strongest tier: reproducible by anyone at the same block.
 */
export function onchain(value: number, unit: string): Q<'ONCHAIN'> {
  return make(value, 'ONCHAIN', unit)
}

/**
 * Measured by us off-chain — a probe latency, a price from an API, a realised
 * volatility. Requires a source and a timestamp, because a measurement without
 * either is indistinguishable from a guess.
 */
export function measured(value: number, unit: string, source: string, at: string): Q<'MEASURED'> {
  if (!source) throw new Error('Q: MEASURED requires a source')
  if (!at) throw new Error('Q: MEASURED requires a timestamp')
  return make(value, 'MEASURED', unit, source, at)
}

/** Produced by a deterministic conformance test. Carries the test id. */
export function tested(value: number, unit: string, testId: string, at: string): Q<'TESTED'> {
  if (!testId) throw new Error('Q: TESTED requires a test id')
  return make(value, 'TESTED', unit, testId, at)
}

/**
 * Asserted by a third party and not verified by us. Always styled weakest in
 * the UI. Requires naming who claimed it.
 */
export function claimed(value: number, unit: string, claimant: string): Q<'CLAIMED'> {
  if (!claimant) throw new Error('Q: CLAIMED requires a claimant')
  return make(value, 'CLAIMED', unit, claimant)
}

/**
 * Combine quantities, taking the weakest provenance of the inputs.
 *
 * A number derived from an on-chain balance and a claimed APR is a claim, not a
 * fact. Doing this by hand is where provenance laundering creeps in, so the
 * arithmetic is centralised here.
 */
const RANK: Record<Provenance, number> = { ONCHAIN: 3, TESTED: 2, MEASURED: 1, CLAIMED: 0 }

export function derive(value: number, unit: string, inputs: readonly Q[]): Q {
  if (inputs.length === 0) throw new Error('Q: derive requires at least one input')
  let weakest = inputs[0] as Q
  for (const q of inputs) if (RANK[q.provenance] < RANK[weakest.provenance]) weakest = q
  return make(
    value,
    weakest.provenance,
    unit,
    weakest.source ?? 'derived',
    weakest.at ?? new Date().toISOString(),
  )
}

/** Envelope shared by every reader, so a caller always knows the block. */
export interface ReadContext {
  /** Block the reads were pinned to. */
  blockNumber: bigint
  /** When the read happened. */
  readAt: string
  chainId: number
}

/** Discriminated union every reader returns. Failure is a first-class result. */
export type ReaderResult<T> =
  | ({ ok: true; data: T } & ReadContext)
  | ({ ok: false; error: string; detail?: string } & ReadContext)

export function ok<T>(data: T, ctx: ReadContext): ReaderResult<T> {
  return { ok: true, data, ...ctx }
}

export function fail<T>(error: string, ctx: ReadContext, detail?: string): ReaderResult<T> {
  return { ok: false, error, ...(detail ? { detail } : {}), ...ctx }
}
