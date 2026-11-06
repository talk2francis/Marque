import { z } from 'zod'
const Job = z.object({ chainId: z.union([z.literal(56), z.literal(97)]), jobId: z.string(), agentId: z.string(), name: z.string().nullable(), priceRaw: z.string().regex(/^\d+$/).nullable(), tokenSymbol: z.string().nullable(), tokenDecimals: z.number().int().min(0).max(36).nullable(), quoteAt: z.string().datetime().nullable() })
export const DemandReport = z.object({
  agentId: z.string(), observedAt: z.string().datetime(), since: z.string().datetime(), total: z.number().int().nonnegative(), nextCursor: z.string().nullable(),
  rows: z.array(z.object({ id: z.number().int(), at: z.string().datetime(), chainId: z.union([z.literal(56), z.literal(97)]), category: z.string(),
    outcome: z.enum(['won', 'lost', 'did_not_quote', 'not_funded']), detail: z.string().max(800), latencyMs: z.number().nonnegative().nullable(),
    priceRaw: z.string().regex(/^\d+$/).nullable(), tokenSymbol: z.string().nullable(), tokenDecimals: z.number().int().min(0).max(36).nullable(),
    ownJob: Job.nullable(), selectedJob: Job.nullable(), badgesAtQuote: z.null(),
  })).max(20),
})
export type DemandReport = z.infer<typeof DemandReport>
export function demandOutcome(priced: boolean, ownFunded: boolean, otherFunded: boolean): DemandReport['rows'][number]['outcome'] {
  if (ownFunded) return 'won'
  if (!priced) return 'did_not_quote'
  return otherFunded ? 'lost' : 'not_funded'
}
