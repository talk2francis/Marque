import { z } from 'zod'
export const LOOP_STEPS = ['answering', 'priced', 'checked', 'hired', 'paid', 'rated'] as const
export type LoopStep = typeof LOOP_STEPS[number]
export interface LoopFact { at: string | null; href: string; detail: string; expiresAt?: string | null; unavailable?: boolean }
export type LoopEvidence = Record<LoopStep, LoopFact | null>
const labels = { answering: 'Answering', priced: 'Priced', checked: 'Checked', hired: 'Hired', paid: 'Paid', rated: 'Rated' }
const missing = {
  answering: 'No successful task-interface observation is recorded. Check the endpoint and its declared service.',
  priced: 'No signed scheduled price is recorded. Open the fix report for the last price-check reason.',
  checked: 'No current checked standing was observed. Read the recorded checks or run the Bench with permission.',
  hired: 'No matching funded job is recorded. Keep the delivery endpoint ready for a buyer.',
  paid: 'No matching payment-release event is recorded. A delivery is separate from payment release.',
  rated: 'No buyer-linked rating outside the team list is recorded. Ratings are chosen and signed by buyers.',
}
export const BuilderLoop = z.object({
  agentId: z.string().max(160), chainId: z.union([z.literal(56), z.literal(97)]), observedAt: z.string().datetime(),
  nodes: z.array(z.object({ id: z.enum(LOOP_STEPS), label: z.string(), at: z.string().datetime().nullable(), href: z.string().max(500), detail: z.string().max(700), expiresAt: z.string().datetime().nullable(), state: z.enum(['observed', 'not_recorded', 'expired', 'unavailable']) })).length(6),
})
export type BuilderLoop = z.infer<typeof BuilderLoop>

export function currentLoopNodes(nodes: BuilderLoop['nodes'], now: number, stale = false): BuilderLoop['nodes'] {
  return nodes.map(n => {
    if (n.id === 'priced' && n.state === 'observed' && n.expiresAt && Date.parse(n.expiresAt) <= now) return { ...n, state: 'expired' }
    if (n.state === 'observed' && (stale && ['answering', 'priced', 'checked'].includes(n.id) || n.id === 'answering' && n.at && now - Date.parse(n.at) > 86_400_000)) return { ...n, state: 'unavailable', detail: 'The current observation could not be confirmed. The last recorded time is retained; read the evidence again before treating it as current.' }
    return n
  })
}

export function loopNodes(evidence: LoopEvidence, fallback: string, now: number): BuilderLoop['nodes'] {
  return LOOP_STEPS.map(id => {
    const fact = evidence[id]
    const expired = id === 'priced' && fact?.expiresAt && Date.parse(fact.expiresAt) <= now
    return { id, label: labels[id], at: fact?.at ?? null, href: fact?.href ?? fallback, detail: fact?.detail ?? missing[id], expiresAt: fact?.expiresAt ?? null, state: fact?.unavailable ? 'unavailable' as const : expired ? 'expired' as const : fact ? 'observed' as const : 'not_recorded' as const }
  })
}
