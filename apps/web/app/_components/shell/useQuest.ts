'use client'
import { useQuery } from '@tanstack/react-query'
import type { QuestStepState } from '../ui/QuestTracker'

/** The quest's five steps, in order. Names are the ones a user reads. */
export const QUEST_CATEGORIES = [
  { key: 'yield', name: 'Yield' },
  { key: 'grid', name: 'Grid' },
  { key: 'rebalancing', name: 'Rebalancing' },
  { key: 'health_factor', name: 'Health factor' },
] as const
export type QuestCategory = (typeof QUEST_CATEGORIES)[number]['key']

export interface WalletHire {
  jobKey: string
  chainId: number
  jobId: string
  agent: { agentKey: string; agentId: string; name: string; category: string | null; firstParty: boolean }
  amount: string | null
  token: { symbol: string; decimals: number } | null
  state: string
  tx: Record<string, string | null>
  timestamps: Record<string, string | null>
  rating: { value: number; stars?: number; tx: string; revoked?: boolean } | null
  eligible: boolean
  reasons: string[]
}

export interface WalletQuest {
  wallet: string
  chainId: number
  asOfBlock: Record<string, number>
  quest: {
    categories: Record<QuestCategory, { done: boolean; delivered?: boolean; jobKey: string | null }>
    ratedAll: boolean
    ownAgentListed: { done: boolean; agentKey: string | null }
    eligible: boolean
    reasons: string[]
  }
  hires: WalletHire[]
  /** Client-side transport provenance; the public JSON body is unchanged. */
  projection?: { computedAt: string | null; stale: boolean }
}

const IN_FLIGHT = new Set(['OPEN', 'REGISTERED', 'BUDGETED', 'FUNDED'])

/**
 * Progress comes from the Quest API only (SPEC-TRACKING section 7): a step is
 * done when the API says so. "Waiting" means a hire in that category is on its
 * way through the chain but the API has not marked the step yet.
 */
export function questStates(w: WalletQuest | null | undefined): QuestStepState[] {
  if (!w) return ['todo', 'todo', 'todo', 'todo', 'todo']
  const cats: QuestStepState[] = QUEST_CATEGORIES.map(({ key }) => {
    if (w.quest.categories[key]?.done) return 'done'
    return w.hires.some((h) => h.agent.category === key && IN_FLIGHT.has(h.state)) ? 'waiting' : 'todo'
  })
  return [...cats, w.quest.ownAgentListed.done ? 'done' : 'todo']
}

/** One wallet's hires on one chain: the campaign chain by default, or 97 for the practice lane. */
export function useWalletQuest(address: string | undefined, chainId?: 56 | 97) {
  return useQuery<WalletQuest>({
    queryKey: ['quest-wallet', address?.toLowerCase(), chainId ?? 'campaign'],
    enabled: Boolean(address),
    queryFn: async () => {
      const r = await fetch(`/api/v1/phase2/wallet/${address}${chainId ? `?chainId=${chainId}` : ''}`, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
      if (!r.ok) throw new Error(String(r.status))
      const value = (await r.json()) as WalletQuest
      return { ...value, projection: {
        computedAt: r.headers.get('X-Marque-Projection-Computed-At'),
        stale: r.headers.get('X-Marque-Projection-Stale') === 'true',
      } }
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: 1,
  })
}
