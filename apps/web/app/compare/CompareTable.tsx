import Link from 'next/link'
import { Chip, WarrantBadge, ProvenanceChip } from '@marque/ui'
import { Badge, Stars } from '../_components/ui'
import { AgentAvatar } from '../_components/AgentAvatar'
import type { MarketRow } from '../register/market-model'
import { referenceAgent } from '../../lib/reference-agents'
import { explorerAddress } from '../../lib/network'
import { agoWords, answersFree, deliveryWords, hireBlocked, isHireable, profileHref } from '../register/market-model'
import styles from './compare.module.css'

/**
 * Agents side by side (shared by /compare and the marketplace's compare sheet, 29 Sep).
 * No hooks and no fetch: it renders the rows it is given, so the sheet opens instantly
 * from the cards already on screen. `hireLink`/`tryLink` say where Hire and Try go (the
 * page links to the storefront; the sheet opens the hire sheet over the marketplace).
 */
export function CompareTable({ chosen, hireLink, tryLink, onNavigate }: {
  chosen: MarketRow[]
  hireLink: (a: MarketRow) => string
  tryLink: (a: MarketRow) => string
  onNavigate?: () => void
}) {
  return (
    <div className={styles.grid} style={{ gridTemplateColumns: `170px repeat(${chosen.length}, minmax(0, 1fr))` }}>
      <div className={styles.rowLabel} />
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.colHead}>
          <AgentAvatar id={a.agentId} category={a.category} reference={a.isReference} size={44} />
          <Link href={profileHref(a) ?? '/register'} className={styles.colName} onClick={onNavigate}>{a.name}</Link>
          {a.isReference ? <a href="/register#reference-agents" className={styles.refLink}><Badge kind="reference" /></a> : null}
        </div>
      ))}

      <div className={styles.rowLabel}>What it does</div>
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.cell}>
          {a.category ? <Chip>{CATEGORY_LABEL[a.category] ?? a.category}</Chip> : <span className={styles.muted}>uncategorised</span>}
          {a.interfaces.length ? <div className={styles.muted}>{a.interfaces.join(' · ')}</div> : null}
        </div>
      ))}

      <div className={styles.rowLabel}>Protocols declared</div>
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.cell}>
          {a.protocols.length > 0
            ? <span>{a.protocols.join(', ')}</span>
            : <span className={styles.muted}>none declared in metadata</span>}
        </div>
      ))}

      <div className={styles.rowLabel}>Can you hire it now</div>
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.cell}>
          {isHireable(a)
            ? <><Badge kind="hireable" /><span className={styles.muted}>{a.commerce.quotedAt ? `live quote ${agoWords(a.commerce.quotedAt)}` : 'live quote'}</span></>
            : <span className={styles.muted}>{hireBlocked(a)}</span>}
        </div>
      ))}

      <div className={styles.rowLabel}>Passed the standard</div>
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.cell}>
          <WarrantBadge
            status={a.warrant.status}
            date={a.warrant.date ? a.warrant.date.slice(0, 10) : undefined}
            testId={a.warrant.testId ?? undefined}
            failedField={a.warrant.failedField ?? undefined}
          />
        </div>
      ))}

      <div className={styles.rowLabel}>Paid jobs (on chain)</div>
      {chosen.map((a) => {
        const j = a.track.jobs
        const d = deliveryWords(a.track.delivery.medianSeconds)
        return (
          <div key={a.agentId} className={styles.cell}>
            {j.funded > 0 ? (
              <>
                <span>{j.funded} paid · {j.delivered} delivered{j.refunded ? ` · ${j.refunded} refunded` : ''}{j.disputed ? ` · ${j.disputed} disputed` : ''} <ProvenanceChip provenance="ONCHAIN" /></span>
                {d ? <span className={styles.muted}>delivers in {d} (median)</span> : null}
                {j.fromTeam ? <span className={styles.muted}>{j.fromTeam} from Marque team wallets</span> : null}
              </>
            ) : <span className={styles.muted}>No paid jobs yet</span>}
          </div>
        )
      })}

      <div className={styles.rowLabel}>Verified buyers</div>
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.cell}>
          <Stars value={a.track.verified.averageStars} count={a.track.verified.count} label="verified" />
        </div>
      ))}

      <div className={styles.rowLabel}>Try it free</div>
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.cell}>
          {answersFree(a) && profileHref(a)
            ? <><span>Yes: it runs your task at its own endpoint before you pay</span><a className="btn btn--sm" href={tryLink(a)} onClick={onNavigate}>Try free</a></>
            : <span className={styles.muted}>Not available</span>}
        </div>
      ))}

      <div className={styles.rowLabel}>On-chain identity</div>
      {chosen.map((a) => <IdentityCell key={a.agentId} a={a} />)}

      <div className={styles.rowLabel}>What it costs</div>
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.cell}>
          {a.price
            ? <><span>{a.price}</span>{a.priceProvenance && <ProvenanceChip provenance={a.priceProvenance} />}</>
            : <span className={styles.muted}>price not advertised</span>}
        </div>
      ))}

      <div className={styles.rowLabel}>Hire</div>
      {chosen.map((a) => (
        <div key={a.agentId} className={styles.cell}>
          {isHireable(a) && profileHref(a)
            ? <a className="btn btn--sm btn--primary" href={hireLink(a)} onClick={onNavigate}>Hire {a.name.length <= 18 ? a.name : 'this agent'}</a>
            : <span className={styles.muted}>{hireBlocked(a)}</span>}
        </div>
      ))}
    </div>
  )
}

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing', grid: 'Grid', yield: 'Yield', health_factor: 'Health factor', security: 'Security',
}

function IdentityCell({ a }: { a: MarketRow }) {
  // Reference agents carry their real ERC-8004 token id (chain 97); third
  // parties carry a numeric token id on chain 56 when their metadata parsed.
  const ref = a.isReference ? referenceAgent(a.agentId) : null
  const chain = ref ? ref.erc8004.chainId : 56
  const tokenId = ref ? String(ref.erc8004.tokenId) : a.tokenId
  const ownerAddr = ref ? ref.erc8004.wallet : a.owner

  if (!(tokenId && /^\d+$/.test(tokenId))) {
    return <div className={styles.cell}><span className={styles.muted}>no on-chain token id in metadata</span></div>
  }
  return (
    <div className={styles.cell}>
      <a className={styles.link} href={explorerAddress(chain, ownerAddr ?? '')} target="_blank" rel="noreferrer">
        ERC-8004 <span className="mono">#{tokenId}</span> · chain {chain}
      </a>
      {ownerAddr && (
        <span className={styles.muted}>
          {ref ? 'operator ' : 'owner '}
          <span className="mono">{ownerAddr.slice(0, 6)}…{ownerAddr.slice(-4)}</span>
          {ref ? ' (Marque)' : ''}
        </span>
      )}
      {(a.protocols.length > 0 || a.identity.x402) && (
        <span className={styles.muted}>
          declares {[...a.protocols, ...(a.identity.x402 ? ['x402'] : [])].join(' · ')} <ProvenanceChip provenance="CLAIMED" />
        </span>
      )}
      {a.identityCount > 1 && (
        <span className={styles.muted}>+{a.identityCount - 1} sibling identit{a.identityCount - 1 === 1 ? 'y' : 'ies'} by this operator</span>
      )}
    </div>
  )
}
