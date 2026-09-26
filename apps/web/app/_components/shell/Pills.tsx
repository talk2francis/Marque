'use client'
import { Tooltip } from '../ui/Tooltip'
import { usePulse } from './usePulse'

const NAME: Record<number, string> = { 56: 'BSC Mainnet', 97: 'BSC Testnet' }
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'unknown' : v.toLocaleString('en-US'))

/**
 * The campaign network and the health of its Quest Index: moss when the
 * indexer is at head, amber when it lags, oxide when the RPC gives no head.
 */
export function NetworkPill({ compact }: { compact?: boolean }) {
  const { data, isError, isPending } = usePulse()
  const state = isPending ? 'loading' : isError || !data ? 'down' : data.network.state
  const chain = data?.network.chainId ?? 56
  const name = NAME[chain] ?? `Chain ${chain}`
  const word = state === 'lagging' ? 'Index catching up' : state === 'down' ? 'RPC unreachable' : null
  const tip = isPending
    ? 'Reading the Quest Index.'
    : isError || !data
      ? 'The status read failed. Hires still work; progress may show late.'
      : `Quest Index at block ${n(data.network.cursorBlock)}, ${n(data.network.lagBlocks)} blocks behind head. Every hire, delivery and rating is read from ${name}.`
  return (
    <Tooltip content={tip} side="bottom">
      <a href="/protocol" className="hpill" data-state={state} data-compact={compact ? '' : undefined} aria-label={`${name}${word ? `, ${word.toLowerCase()}` : ''}. Open the protocol page.`}>
        <span className="hpill-dot" aria-hidden="true" />
        <span className="hpill-text">{name}{word ? <span className="hpill-sub"> · {word}</span> : null}</span>
      </a>
    </Tooltip>
  )
}

/** Overall health, linking to /status: every first-party agent checked on time, and the index readable. */
export function StatusPill() {
  const { data, isError, isPending } = usePulse()
  const state = isPending ? 'loading' : isError || !data ? 'down' : data.system.state
  const text = state === 'loading' ? 'Checking' : state === 'ok' ? 'Operational' : state === 'degraded' ? 'Degraded' : 'Status unknown'
  const tip = data
    ? `${n(data.system.firstPartyFresh)} of ${n(data.system.firstPartyServices)} Marque reference services checked inside their window. Read ${new Date(data.at).toISOString().slice(11, 16)} UTC.`
    : 'Open the status page for freshness, indexer lag and quest totals.'
  return (
    <Tooltip content={tip} side="bottom">
      <a href="/status" className="hpill hpill--status" data-state={state} aria-label={`System status: ${text}. Open the status page.`}>
        <span className="hpill-dot" aria-hidden="true" />
        <span className="hpill-text">{text}</span>
      </a>
    </Tooltip>
  )
}
