/**
 * What every Marque reference agent is, underneath its protocol faces.
 *
 * The five agents speak ERC-8004 identity, ERC-8183 commerce and x402 payment,
 * and none of that has any bearing on whether their answers are right. So the
 * value layer is separated from the commerce layer entirely: an Engine takes
 * the prompt a buyer sent and returns the strict JSON that buyer asked for, and
 * knows nothing about payment, signing or transport.
 *
 * Three rules every engine obeys, all of them paid for once already:
 *
 *  1. **Refuse rather than default.** A parser that silently falls back to a
 *     default answers a question nobody asked, and — when the default happens
 *     to match the published case — scores PASS while being wrong. That has
 *     happened to this project. `refuse()` exists so the failure is loud.
 *  2. **Read the chain; never pattern-match the prompt.** The engines use the
 *     same readers the rest of the product uses, which is the only way to be
 *     right at an arbitrary block for an arbitrary address.
 *  3. **Fail fast and structured.** An upstream that is degraded must produce a
 *     legible error in under three seconds, not a ninety-second hang. A buyer
 *     forgives a fast no; they do not forgive a spinner.
 *
 * DISCLOSED, because it would be dishonest not to: these engines share the
 * reader layer (`@marque/positions`) with the conformance grader. They do NOT
 * share answer construction — every engine builds its own response — but a
 * common reader means a common blind spot, and an MCS pass by a Marque
 * reference agent is evidence the pipeline works end to end, not evidence that
 * the agent is good. Third-party passes are the ones that mean something.
 */

export type EngineCategory = 'rebalancing' | 'grid' | 'yield' | 'health_factor' | 'security'

export interface EngineMeta {
  /** Stable id, also the PM2 process suffix and the public path segment. */
  id: string
  name: string
  category: EngineCategory
  /** The MCS test this engine's answers are graded against, when one exists. */
  testId: string | null
  description: string
  /** Price in USD per call, as declared on the agent's card and x402 rail. */
  priceUsd: number
  skills: Array<{ id: string; name: string; description: string; tags: string[] }>
}

/**
 * A structured refusal. Always an answer, never a throw.
 *
 * The index signature is what lets a refusal BE an answer rather than a
 * separate channel — the caller serialises one object either way, and a
 * refusal that travelled differently from an answer would be dropped by
 * exactly the clients that most need to read it.
 */
export interface Refusal {
  error: string
  /** What the caller must add to the request for it to be answerable. */
  need?: string
  [key: string]: unknown
}

export type EngineAnswer = Record<string, unknown>

export interface Engine {
  readonly meta: EngineMeta
  /**
   * Answer a task. Never throws: a failure is a returned object carrying the
   * reason. An exception loses the evidence, and the evidence is the product.
   */
  run(prompt: string, opts?: { deadlineMs?: number }): Promise<EngineAnswer>
}

/** The refusal helper. Using it is how a wrong answer stays unwritten. */
export function refuse(error: string, need?: string): Refusal {
  return need === undefined ? { error } : { error, need }
}

/**
 * Hard deadline around an upstream read.
 *
 * Three seconds is the structured-failure budget: past that the buyer is better
 * served by an error naming the upstream than by a longer wait.
 */
export async function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
