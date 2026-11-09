'use client'
import { useEffect, useState } from 'react'

/**
 * Under Positions (11_EXPERIENCE, Positions lines): the other three kinds for this address, as one line each. An
 * armed charter of that kind links to its page; otherwise the line opens that kind's builder with the address.
 * Asks the charters API, which answers only when Charters is public or previewed: until then it renders nothing.
 */
type C = { chainId: number; address: string; kind: 'loan' | 'yield' | 'grid' | 'range'; kindName: string }
const LINES = [
  { kind: 'yield', cta: 'Sweep idle stablecoins', words: 'Keep your wallet topped up and the rest earning in Venus, in your name.' },
  { kind: 'range', cta: 'Keep a range', words: 'Keep a PancakeSwap position in range, within loss limits you set.' },
  { kind: 'grid', cta: 'Grid a pair', words: 'Buy the dips and sell one step up, between prices you choose.' },
] as const

export function KindLines({ owner, chainId = 56 }: { owner: string; chainId?: 56 | 97 }) {
  const [state, setState] = useState<{ on: boolean; charters: C[] } | null>(null)
  useEffect(() => {
    let live = true
    setState(null)
    fetch(`/api/v1/guards?chainId=${chainId}&owner=${owner}&state=armed&limit=20`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { charters?: C[] } | null) => { if (live) setState(j ? { on: true, charters: j.charters ?? [] } : { on: false, charters: [] }) })
      .catch(() => { if (live) setState({ on: false, charters: [] }) })
    return () => { live = false }
  }, [owner, chainId])
  if (!state?.on) return null
  return (
    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>
      {LINES.map((l) => {
        const mine = state.charters.filter((c) => c.kind === l.kind)
        return (
          <li key={l.kind} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', fontSize: 14, color: 'var(--ink-2)' }}>
            {mine.length ? mine.map((c) => <a key={c.address} href={`/charters/${c.chainId}/${c.address}`} style={{ color: 'var(--ink)', textUnderlineOffset: 3 }}>{c.kindName} armed, {c.address.slice(0, 6)}…{c.address.slice(-4)}</a>)
              : <><a className="btn btn--sm" href={`/charters/new?kind=${l.kind}&chain=${chainId}&account=${owner}`}>{l.cta}</a><span>{l.words}</span></>}
          </li>
        )
      })}
    </ul>
  )
}
