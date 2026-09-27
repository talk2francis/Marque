'use client'
import { usePulse } from './usePulse'

/**
 * The footer's live line (Kerb's market clocks, Marque's chain): the campaign
 * network's head block, how far the Quest Index trails it, and whether every
 * Marque reference seller answered its last probe. Links to /status. Says
 * nothing rather than a stale number when the read fails.
 */
export function FooterPulse() {
  const { data } = usePulse()
  if (!data) return <a className="footer-pulse" href="/status"><span className="footer-pulse-dot" data-state="unknown" aria-hidden="true" />Live status</a>
  const n = data.network
  const net = n.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'
  const lag = n.lagBlocks
  return (
    <a className="footer-pulse" href="/status" title="Read from the chain and Marque's own probes every 30 seconds">
      <span className="footer-pulse-dot" data-state={n.state === 'ok' && data.system.state === 'ok' ? 'ok' : n.state === 'down' ? 'down' : 'warn'} aria-hidden="true" />
      <span>{net}</span>
      {n.headBlock !== null ? <span className="num">block {n.headBlock.toLocaleString('en-US')}</span> : null}
      {lag !== null ? <span>quest index {lag <= 20 ? 'in step' : `${lag.toLocaleString('en-US')} blocks behind`}</span> : null}
      {data.system.firstPartyServices ? <span>{data.system.firstPartyFresh} of {data.system.firstPartyServices} reference sellers answering</span> : null}
    </a>
  )
}
