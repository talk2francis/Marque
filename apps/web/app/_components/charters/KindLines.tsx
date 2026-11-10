'use client'
import { useQuery } from '@tanstack/react-query'

/**
 * Under Positions (11_EXPERIENCE, Positions lines): the other three kinds for this address, as one line each. An
 * armed charter of that kind links to its page; otherwise the line opens that kind's builder with the address.
 * Asks the charters API, which answers only when Charters is public or previewed: until then it renders nothing.
 */
type C = { chainId: number; address: string; kind: 'loan' | 'yield' | 'grid' | 'range'; kindName: string; positionId?: string | null }
const LINES = [
  { kind: 'yield', cta: 'Sweep idle stablecoins', words: 'Keep your wallet topped up and the rest earning in Venus, in your name.' },
  { kind: 'range', cta: 'Keep a range', words: 'Keep a PancakeSwap position in range, within loss limits you set.' },
  { kind: 'grid', cta: 'Grid a pair', words: 'Buy the dips and sell one step up, between prices you choose.' },
] as const

export function KindLines({ owner, chainId = 56, kinds = ['yield', 'grid'], positionId }: { owner: string; chainId?: 56 | 97; kinds?: readonly C['kind'][]; positionId?: string }) {
  const { data: state } = useQuery({
    queryKey: ['position-charters', chainId, owner.toLowerCase()], staleTime: 30_000, retry: false,
    queryFn: async ({ signal }) => {
      const charters: C[] = []
      let cursor: string | null = null
      do {
        const r = await fetch(`/api/v1/guards?chainId=${chainId}&owner=${owner}&state=armed&limit=100${cursor ? `&cursor=${cursor}` : ''}`, { cache: 'no-store', signal })
        if (!r.ok) throw new Error('Charters unavailable')
        const j = await r.json() as { charters?: C[]; nextCursor?: string | null }
        charters.push(...(j.charters ?? [])); cursor = j.nextCursor ?? null
      } while (cursor)
      return { on: true, charters }
    },
  })
  if (!state?.on) return null
  return (
    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>
      {LINES.filter(l => kinds.includes(l.kind)).map((l) => {
        const mine = state.charters.filter((c) => c.kind === l.kind && (l.kind !== 'range' || !positionId || c.positionId === positionId))
        return (
          <li key={l.kind} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', fontSize: 14, color: 'var(--ink-2)' }}>
            {mine.length ? mine.map((c) => <a key={c.address} href={`/charters/${c.chainId}/${c.address}`} style={{ color: 'var(--ink)', textUnderlineOffset: 3 }}>{c.kindName} armed, {c.address.slice(0, 6)}…{c.address.slice(-4)}</a>)
              : <><a className="btn btn--sm" href={`/charters/new?kind=${l.kind}&chain=${chainId}&account=${owner}${positionId ? `&position=${positionId}` : ''}`}>{l.cta}</a><span>{l.words}</span></>}
          </li>
        )
      })}
    </ul>
  )
}
