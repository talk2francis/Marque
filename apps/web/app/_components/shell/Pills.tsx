'use client'
import { Tooltip } from '../ui/Tooltip'
import { usePulse } from './usePulse'

const NAME: Record<number, string> = { 56: 'BSC Mainnet', 97: 'BSC Testnet' }
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'unknown' : v.toLocaleString('en-US'))

/**
 * One pill for the campaign network and the health behind it (27 Sep: the
 * separate "Operational" pill made the header noisy). The name is the network;
 * the dot is the worse of two reads: the Quest Index against chain head, and
 * every Marque reference service checked on time. Moss is all well, amber is
 * the index catching up or a service overdue, oxide is the RPC unreachable. A
 * word joins the name only when something is wrong. The tooltip carries both
 * reads, and the pill opens /status.
 */
export function NetworkPill() {
  const { data, isError, isPending } = usePulse()
  const net = isPending ? 'loading' : isError || !data ? 'down' : data.network.state
  const sys = data?.system.state ?? null
  const state = net === 'loading' ? 'loading' : net === 'down' ? 'down' : net === 'lagging' || sys === 'degraded' ? 'degraded' : 'ok'
  const chain = data?.network.chainId ?? 56
  const name = NAME[chain] ?? `Chain ${chain}`
  const word = net === 'down' ? 'Status unknown' : net === 'lagging' ? 'Catching up' : sys === 'degraded' ? 'Degraded' : null
  const tip = isPending
    ? 'Reading the Quest Index and service checks.'
    : isError || !data
      ? 'The status read failed. Hires still work; progress may show late. Open the status page.'
      : [
          `${name}: the Quest Index is at block ${n(data.network.cursorBlock)}, ${n(data.network.lagBlocks)} blocks behind head.`,
          `${n(data.system.firstPartyFresh)} of ${n(data.system.firstPartyServices)} Marque reference services checked inside their window.`,
          `Read ${new Date(data.at).toISOString().slice(11, 16)} UTC. Open the status page.`,
        ].join(' ')
  const all = state === 'ok' ? 'all systems normal' : state === 'loading' ? 'checking' : (word ?? '').toLowerCase()
  return (
    <Tooltip content={tip} side="bottom">
      <a href="/status" className="hpill" data-state={state} aria-label={`${name}, ${all}. Open the status page.`}>
        <span className="hpill-dot" aria-hidden="true" />
        <span className="hpill-text">{name}{word ? <span className="hpill-sub"> · {word}</span> : null}</span>
      </a>
    </Tooltip>
  )
}
