import 'server-only'
import { cachedProjection, type Projection } from '@marque/db'
import { questFor, type ChainId } from '@marque/commerce'

/** One cached read of /api/v1/quest/{address}, shared by the API, the page, the Dock and the OG image. */
export type QuestResult = Awaited<ReturnType<typeof questFor>>

export const QUEST_ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function questChains(raw: string | null): ChainId[] | null {
  if (raw === null || raw.trim() === '') return [56, 97]
  const list = [...new Set(raw.split(',').map((s) => Number(s.trim())))]
  if (!list.length || list.some((n) => n !== 56 && n !== 97)) return null
  return list as ChainId[]
}

export function questProjection(address: string, chains: ChainId[] = [56, 97]): Promise<Projection<QuestResult>> {
  return cachedProjection(`quest:v1:${chains.join(',')}:${address.toLowerCase()}`, () => questFor(address, chains), { freshMs: 60_000, timeoutMs: 12_000 })
}
