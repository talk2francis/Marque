import type { CSSProperties } from 'react'

/** 0x3a…080a: a local copy, since AddressChip's helper lives in a client module. */
const middle = (v: string, head = 6, tail = 4) => (v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`)

/**
 * A slow ticker of real recent Marque hires and ratings (agent, category,
 * price, short tx, age). Pauses on hover and focus, lies still under reduced
 * motion, and is absent when there is nothing real to show.
 */
export interface TapeItem {
  id: string
  kind: 'hire' | 'rating'
  agent: string
  category: string
  /** "0.10 U", or "5 of 5" for a rating. */
  value: string
  tx: string
  href: string
  /** Age, already worded ("2m"). */
  age: string
  /** A wallet on the published team list: a real event, marked, never counted for the campaign. */
  team?: boolean
}

export function Tape({ items, label = 'Recent hires and ratings on Marque' }: { items: TapeItem[]; label?: string }) {
  if (items.length === 0) return null
  const row = (hidden: boolean) =>
    items.map((e) => (
      <a key={`${hidden ? 'b' : 'a'}-${e.id}`} className="tp-item" data-kind={e.kind} href={e.href} tabIndex={hidden ? -1 : undefined} aria-hidden={hidden || undefined} {...(e.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>
        <span className="tp-kind" aria-hidden="true" />
        <span className="tp-agent">{e.agent}</span>
        <span>{e.category}</span>
        <span className="num">{e.value}</span>
        <span className="tp-mono">{middle(e.tx, 4, 4)}</span>
        <span className="tp-age">{e.age}</span>
        {e.team ? <span className="tp-team" title="A wallet on Marque's published team list. Real on chain, never counted for the campaign.">team wallet</span> : null}
      </a>
    ))
  const speed = { '--tape-s': `${Math.max(40, items.length * 9)}s` } as CSSProperties
  return (
    <div className="tp" role="region" aria-label={label}>
      <div className="tp-track" style={speed}>
        {row(false)}
        <span aria-hidden="true" style={{ display: 'contents' }}>{row(true)}</span>
      </div>
    </div>
  )
}
