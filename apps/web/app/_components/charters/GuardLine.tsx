'use client'
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

/**
 * GuardLine (03_EXPERIENCE section 4): one line under a Venus loan. "Guarded below 1.30 until 8 Dec" with a link
 * to the charter, or "Guard this loan" into the builder. It asks the guards API, which answers only when Charters
 * is public or previewed: until then this renders nothing at all.
 */
type Guard = { chainId: number; address: string; symbol: string; trigger: string; expiresAt: string }
const fmt = (wad: string) => (Number(BigInt(wad) / 10n ** 14n) / 10_000).toFixed(2)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function GuardLine({ owner, chainId = 56 }: { owner: string; chainId?: 56 | 97 }) {
  const [state, setState] = useState<{ on: boolean; guards: Guard[] } | null>(null)
  useEffect(() => {
    let live = true
    setState(null)
    fetch(`/api/v1/guards?chainId=${chainId}&owner=${owner}&state=armed&limit=5`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { guards?: Guard[] } | null) => { if (live) setState(j ? { on: true, guards: j.guards ?? [] } : { on: false, guards: [] }) })
      .catch(() => { if (live) setState({ on: false, guards: [] }) })
    return () => { live = false }
  }, [owner, chainId])
  if (!state?.on) return null
  const style = { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: '6px 12px', marginTop: 10, fontSize: 14, color: 'var(--ink-2)' }
  if (state.guards.length) {
    return (
      <p style={style}>
        <ShieldCheck aria-hidden="true" style={{ width: 16, height: 16, color: 'var(--moss)' }} />
        {state.guards.map((g, i) => (
          <a key={g.address} href={`/charters/${g.chainId}/${g.address}`} style={{ color: 'var(--ink)', textUnderlineOffset: 3 }}>
            {i ? ', ' : ''}{g.symbol} loan guarded below {fmt(g.trigger)} until {day(g.expiresAt)}
          </a>
        ))}
      </p>
    )
  }
  return (
    <p style={style}>
      <a className="btn btn--sm" href={`/charters/new?chain=${chainId}&account=${owner}`}>Guard this loan</a>
      <span>An agent repays from your wallet into this loan if its health falls below a line you draw.</span>
    </p>
  )
}
