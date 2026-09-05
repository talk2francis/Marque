import type { Engine } from './types.js'

/**
 * The Marque face of a reference agent.
 *
 * The BNB Agent Studio scaffold gives each agent two commerce rails —
 * ERC-8183 escrow and an x402/B402 HTTP rail — and both are genuinely useful.
 * Neither is reachable without paying, which is correct for selling work and
 * wrong for two things this marketplace depends on:
 *
 *   1. **Conformance.** MCS grades an agent by asking it a question. A test
 *      that must first fund an on-chain escrow is a test nobody runs, and an
 *      agent nobody can test carries no warrant.
 *   2. **Preflight.** A buyer decides whether to hire by seeing what the agent
 *      would say. Charging for that is charging for the shop window.
 *
 * So every Marque reference agent also serves a FREE, read-only A2A face: send
 * it the task as plain text, get the structured answer back, pay nothing, sign
 * nothing. It is the same engine and the same answer the paid rails deliver —
 * the rails differ in settlement, never in quality, because an agent whose free
 * answer is worse than its paid one is running a bait.
 *
 * The free face is READ-ONLY by construction: the engines only ever read chain
 * state, and signing lives in the scaffold's fixed `signing.ts`, which this
 * path never touches.
 */

/** A2A JSON-RPC request shapes we accept on the free face. */
export function textFromA2ABody(body: unknown): string {
  const b = body as {
    params?: { message?: { parts?: Array<{ kind?: string; text?: string; data?: unknown }> } }
  }
  const parts = b?.params?.message?.parts ?? []
  const text = parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
  if (text) return text
  // Some clients put the prompt in a data part. Read it rather than refusing
  // on a technicality — we refuse for missing FACTS, not missing ceremony.
  for (const p of parts) {
    if (p?.data && typeof p.data === 'object') {
      const rec = p.data as Record<string, unknown>
      for (const key of ['prompt', 'task', 'text', 'question']) {
        if (typeof rec[key] === 'string') return rec[key] as string
      }
    }
  }
  return ''
}

/** The A2A result envelope a standard client knows how to unwrap. */
export function a2aResult(id: unknown, answer: unknown): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: id ?? 1,
    result: {
      kind: 'task',
      status: { state: 'completed' },
      artifacts: [{ parts: [{ kind: 'text', text: JSON.stringify(answer) }] }],
    },
  }
}

export function a2aError(id: unknown, message: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? 1, error: { code: -32000, message } }
}

/**
 * The public agent card for a Marque reference agent.
 *
 * It names its own callable endpoint explicitly. A card that names nothing is
 * unaddressable, and this project refuses to guess an endpoint for anyone —
 * including itself.
 */
export function marqueCard(engine: Engine, publicUrl: string): Record<string, unknown> {
  return {
    name: engine.meta.name,
    description: engine.meta.description,
    url: `${publicUrl.replace(/\/$/, '')}/a2a`,
    version: '1.0.0',
    protocolVersion: '0.3.0',
    preferredTransport: 'JSONRPC',
    provider: { organization: 'Marque', url: 'https://marque.trade' },
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['application/json'],
    skills: engine.meta.skills.map((s) => ({
      ...s,
      inputModes: ['text/plain'],
      outputModes: ['application/json'],
    })),
    /**
     * Stated on the card itself, because a buyer reading it deserves to know
     * three things before they call: this agent is first-party, its free face
     * is free, and its engine shares a reader layer with the grader that
     * issues its warrant.
     */
    'x-marque': {
      referenceAgent: true,
      category: engine.meta.category,
      standard: engine.meta.testId,
      freePreflight: true,
      priceUsd: engine.meta.priceUsd,
      disclosure:
        'A Marque reference agent. It is ranked by the same published test as any third party, including when a third party beats it. Its engine shares the reader layer with the conformance grader, so an MCS pass here is evidence the pipeline works rather than evidence the agent is good.',
    },
  }
}

/**
 * The work hook the scaffold's paid rails call.
 *
 * Deliberately the SAME engine the free face uses. The LLM is not in this path
 * at all: every answer is deterministic arithmetic over chain reads, which is
 * what makes it gradeable and what keeps AGENTS.md invariant 10 true — the LLM
 * never signs and never prices, and here it does not even compute.
 */
export function engineRunWork(engine: Engine) {
  return async (prompt: string): Promise<string> => {
    const answer = await engine.run(prompt)
    return JSON.stringify(answer)
  }
}
