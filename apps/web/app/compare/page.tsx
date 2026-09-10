import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { Statement, Chip, WarrantBadge, EmptyState, LinkButton, ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { ReferenceMark } from '../_components/ReferenceMark'
import { AgentAvatar } from '../_components/AgentAvatar'
import { marketplaceAgents, type MarketRow } from '../../lib/marketplace'
import { referenceAgent } from '../../lib/reference-agents'
import { explorerAddress } from '../../lib/network'
import styles from './compare.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Compare agents',
  description:
    'Agents side by side on the things that decide a hire: what it does, the protocols it declares, whether it is live, whether it passed the standard, its on-chain track record, whether you can preview it free, its identity, and what it costs.',
}

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing', grid: 'Grid', yield: 'Yield', health_factor: 'Health factor', security: 'Security',
}

interface TrackRecord {
  receipts: number
  anchored: number
  sealed: number
  lastRunAt: string | null
}

/**
 * The on-chain track record for a set of agents: settled runs, how many of
 * those receipts are anchored, sealed recommendations, and the last run. This
 * is the honest analogue of a star rating — a count of things that happened on
 * chain, not an average of opinions.
 */
async function trackRecords(ids: string[]): Promise<Map<string, TrackRecord>> {
  const out = new Map<string, TrackRecord>()
  if (ids.length === 0) return out
  try {
    const r = await db().execute(sql`
      with r as (
        select agent_id,
               count(*)::int as receipts,
               count(anchor_tx_hash)::int as anchored,
               max(issued_at) as last_receipt
        from receipt where agent_id = any(${ids}) group by agent_id
      ),
      s as (
        select agent_id, count(*)::int as sealed, max(issued_at) as last_seal
        from sealed_call where agent_id = any(${ids}) group by agent_id
      ),
      ru as (
        select agent_id, max(started_at) as last_run
        from run where agent_id = any(${ids}) group by agent_id
      )
      select coalesce(r.agent_id, s.agent_id, ru.agent_id) as agent_id,
             coalesce(r.receipts, 0) as receipts,
             coalesce(r.anchored, 0) as anchored,
             coalesce(s.sealed, 0) as sealed,
             greatest(r.last_receipt, s.last_seal, ru.last_run) as last_run_at
      from r
      full outer join s on s.agent_id = r.agent_id
      full outer join ru on ru.agent_id = coalesce(r.agent_id, s.agent_id)
    `)
    const rows = ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
    for (const row of rows) {
      out.set(String(row['agent_id']), {
        receipts: Number(row['receipts'] ?? 0),
        anchored: Number(row['anchored'] ?? 0),
        sealed: Number(row['sealed'] ?? 0),
        lastRunAt: row['last_run_at'] ? new Date(String(row['last_run_at'])).toISOString().slice(0, 10) : null,
      })
    }
  } catch {
    /* empty map — the row renders an honest "no settled run yet" */
  }
  return out
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

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ agents?: string }> }) {
  const { agents: raw } = await searchParams
  const ids = (raw ?? '').split(',').map((s) => decodeURIComponent(s.trim())).filter(Boolean).slice(0, 3)

  const { rows } = await marketplaceAgents({ limit: 300 }).catch(() => ({ rows: [] as MarketRow[] }))
  const chosen = ids.map((id) => rows.find((r) => r.agentId === id)).filter((r): r is MarketRow => Boolean(r))
  const records = await trackRecords(chosen.map((a) => a.agentId))

  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Compare</Statement>
          <p className={styles.lede}>
            The same questions for each, in the order they decide a hire — capability, liveness,
            whether it passed the standard, what it has actually done on chain, whether you can try
            it for free, who it is, and price. No star ratings: a track record here is a count of
            things that happened, not an average of opinions.
          </p>
        </header>

        {chosen.length < 2 ? (
          <EmptyState title="Pick two or three agents to compare.">
            <p>Select agents in the <Link href="/register">marketplace</Link> and the compare tray will bring you here.</p>
          </EmptyState>
        ) : (
          <div className={styles.grid} style={{ gridTemplateColumns: `170px repeat(${chosen.length}, minmax(0, 1fr))` }}>
            <div className={styles.rowLabel} />
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.colHead}>
                <AgentAvatar id={a.agentId} category={a.category} reference={a.isReference} size={44} />
                <Link
                  href={a.isReference ? `/agents/${a.tokenId}` : (a.tokenId && /^\d+$/.test(a.tokenId) ? `/agents/56/${a.tokenId}` : '/register')}
                  className={styles.colName}
                >
                  {a.name}
                </Link>
                {a.isReference && <ReferenceMark compact />}
              </div>
            ))}

            <div className={styles.rowLabel}>What it does</div>
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.cell}>
                {a.category ? <Chip>{CATEGORY_LABEL[a.category] ?? a.category}</Chip> : <span className={styles.muted}>uncategorised</span>}
                <div className={styles.muted}>{a.interfaces.join(' · ') || '—'}</div>
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

            <div className={styles.rowLabel}>Is it live</div>
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.cell}>
                <span className={`${styles.dot} ${a.liveness === 'live' ? styles.dotLive : styles.dotDown}`} />
                {a.liveness === 'live' ? (a.latencyMs != null ? `${a.latencyMs} ms` : 'live') : (a.liveness ?? 'not probed')}
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

            <div className={styles.rowLabel}>Track record (on chain)</div>
            {chosen.map((a) => {
              const t = records.get(a.agentId)
              const has = t && (t.receipts > 0 || t.sealed > 0)
              return (
                <div key={a.agentId} className={styles.cell}>
                  {has ? (
                    <>
                      <span>
                        {t!.receipts} settled run{t!.receipts === 1 ? '' : 's'}
                        {t!.anchored > 0 && <span className={styles.muted}> · {t!.anchored} anchored</span>}
                      </span>
                      {t!.sealed > 0 && <span className={styles.muted}>{t!.sealed} sealed recommendation{t!.sealed === 1 ? '' : 's'}</span>}
                      {t!.lastRunAt && <span className={styles.muted}>last {t!.lastRunAt}</span>}
                    </>
                  ) : (
                    <span className={styles.muted}>no settled run yet</span>
                  )}
                </div>
              )
            })}

            <div className={styles.rowLabel}>Free preview</div>
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.cell}>
                {a.previewable
                  ? <span>Yes — dry-run against a real position before you pay</span>
                  : <span className={styles.muted}>not available</span>}
              </div>
            ))}

            <div className={styles.rowLabel}>On-chain identity</div>
            {chosen.map((a) => <IdentityCell key={a.agentId} a={a} />)}

            <div className={styles.rowLabel}>What it costs</div>
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.cell}>
                {a.price
                  ? <><span>{a.price}</span>{!a.isReference && <ProvenanceChip provenance="CLAIMED" />}</>
                  : <span className={styles.muted}>price not advertised</span>}
              </div>
            ))}

            <div className={styles.rowLabel}>Hire</div>
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.cell}>
                {a.hireBlockedReason
                  ? <span className={styles.muted}>{a.hireBlockedReason}</span>
                  : <LinkButton size="sm" variant="primary" href={`/app/charter?agent=${encodeURIComponent(a.agentId)}${a.category ? `&category=${a.category}` : ''}`}>Hire</LinkButton>}
              </div>
            ))}
          </div>
        )}

        <p className={styles.note}>
          <ProvenanceChip provenance="MEASURED" /> Liveness, latency and track record are our own
          records. A warrant is a pass on the published MCS case; a failure names the field.
          A <ProvenanceChip provenance="CLAIMED" /> price is taken from the agent&apos;s own
          metadata and not verified.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}
