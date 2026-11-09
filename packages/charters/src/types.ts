import { z } from 'zod'

/**
 * The Charters API's inputs and outputs, shared by the route handlers, the MCP tools and the browser. Amounts and
 * health values travel as decimal strings of the chain's integers (health has 18 decimals), so nothing is rounded
 * on the way. Every live read carries its block and read time.
 */
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'an address: 0x and 40 hex characters')
const uint = z.string().regex(/^\d{1,78}$/)
export const ChainIdSchema = z.coerce.number().refine((n): n is 56 | 97 => n === 56 || n === 97, 'chainId is 56 or 97').transform((n) => n as 56 | 97)
/** A health value as people type it ("1.30"), between the factory's bounds. */
export const HealthInputSchema = z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, 'a health such as 1.30')

export const GuardListQuery = z.object({
  chainId: ChainIdSchema.optional(),
  owner: address.optional(),
  state: z.enum(['armed', 'ended', 'all']).default('all'),
  cursor: z.string().regex(/^\d{1,20}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const GuardKey = z.object({ chainId: ChainIdSchema, address }).strict()

export const QuoteQuery = z.object({
  chainId: ChainIdSchema,
  account: address,
  market: address.optional(),
  trigger: HealthInputSchema.optional(),
  target: HealthInputSchema.optional(),
}).strict()

export const AgentActsQuery = z.object({ chainId: ChainIdSchema.optional(), agentId: z.string().regex(/^(56|97):0x[0-9a-fA-F]{40}:\d{1,30}$/) }).strict()

export const LivePreview = z.object({
  state: z.enum(['watching', 'would_act', 'ended', 'expired', 'no_debt', 'no_funds', 'unavailable']),
  health: uint.nullable(),
  wouldRepay: uint,
  available: uint,
  debt: uint,
  blockNumber: uint.nullable(),
  readAt: z.string(),
  fromChain: z.literal(true),
  /** Why the live read could not be made (Venus refusing a price, an RPC failure). */
  unavailableReason: z.string().nullable(),
})
export type LivePreview = z.infer<typeof LivePreview>

export const GuardSummary = z.object({
  chainId: z.union([z.literal(56), z.literal(97)]),
  address,
  owner: address,
  vDebt: address,
  token: address,
  symbol: z.string(),
  decimals: z.number(),
  trigger: uint,
  target: uint,
  budget: uint,
  tip: uint,
  spent: uint,
  acts: z.number(),
  expiresAt: z.string(),
  createdAt: z.string(),
  createdTx: z.string(),
  endedAt: z.string().nullable(),
  status: z.enum(['armed', 'ended', 'expired']),
  final: z.boolean(),
  lastSample: z.object({ state: z.number(), health: uint.nullable(), readAt: z.string(), blockNumber: uint }).nullable(),
})
export type GuardSummary = z.infer<typeof GuardSummary>
