import { z } from 'zod'
const Block = z.string().regex(/^\d{1,16}$/)
const Value = z.union([z.number().finite(), z.string().max(500), z.boolean(), z.null()])
export const RecheckField = z.object({
  field: z.string().max(80), label: z.string().max(160), unit: z.string().max(40).nullable(),
  atAnswer: z.object({ value: Value, block: Block, provenance: z.enum(['CLAIMED', 'TESTED']), agreed: z.boolean().nullable() }),
  now: z.object({ value: Value, block: Block, provenance: z.enum(['ONCHAIN', 'MEASURED']) }),
  stillHolds: z.boolean().nullable(), detail: z.string().max(800),
})
export const RecheckResult = z.object({
  version: z.literal(1), chainId: z.union([z.literal(56), z.literal(97)]), jobId: z.string().regex(/^\d{1,12}$/),
  observationChainId: z.literal(56), observedAt: z.string().datetime(), category: z.string().max(40).nullable(),
  state: z.enum(['compared', 'nothing_to_recheck', 'unsupported']), reason: z.string().max(600).nullable(),
  answerBlock: Block.nullable(), currentBlock: Block.nullable(), answerAt: z.string().max(80).nullable(),
  rows: z.array(RecheckField).max(32), askAgain: z.string().max(500).startsWith('/tender?').nullable(),
})
export type RecheckField = z.infer<typeof RecheckField>
export type RecheckResult = z.infer<typeof RecheckResult>
export const RecheckIndex = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), total: z.number().int().nonnegative(), observedAt: z.string().datetime(),
  rows: z.array(z.object({ chainId: z.union([z.literal(56), z.literal(97)]), jobId: z.string().regex(/^\d{1,12}$/), answerBlock: Block, answeredAt: z.string().datetime().nullable() })).max(20),
  nextCursor: z.string().regex(/^\d+$/).nullable(),
})
export type RecheckIndex = z.infer<typeof RecheckIndex>
