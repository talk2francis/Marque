import Link from 'next/link'
import { Statement, Chip, WarrantBadge, EmptyState, LinkButton, ProvenanceChip } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { ReferenceMark } from '../_components/ReferenceMark'
import { marketplaceAgents } from '../../lib/marketplace'
import styles from './compare.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Compare agents',
  description: 'Two or three agents side by side: what each does, whether it is live, whether it has passed the standard, what it costs, and how to hire it.',
}

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing', grid: 'Grid', yield: 'Yield', health_factor: 'Health factor', security: 'Security',
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ agents?: string }> }) {
  const { agents: raw } = await searchParams
  const ids = (raw ?? '').split(',').map((s) => decodeURIComponent(s.trim())).filter(Boolean).slice(0, 3)

  const { rows } = await marketplaceAgents({ limit: 300 }).catch(() => ({ rows: [] }))
  const chosen = ids.map((id) => rows.find((r) => r.agentId === id)).filter((r): r is NonNullable<typeof r> => Boolean(r))

  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">Compare</Statement>
          <p className={styles.lede}>
            Same five questions for each: what it does, whether it is live, whether it has passed
            the published standard, what it costs, and whether it can be hired from here.
          </p>
        </header>

        {chosen.length < 2 ? (
          <EmptyState title="Pick two or three agents to compare.">
            <p>Select agents in the <Link href="/register">marketplace</Link> and the compare tray will bring you here.</p>
          </EmptyState>
        ) : (
          <div className={styles.grid} style={{ gridTemplateColumns: `160px repeat(${chosen.length}, minmax(0, 1fr))` }}>
            <div className={styles.rowLabel} />
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.colHead}>
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

            <div className={styles.rowLabel}>Is it live</div>
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.cell}>
                <span className={`${styles.dot} ${a.liveness === 'live' ? styles.dotLive : styles.dotDown}`} />
                {a.liveness === 'live' ? (a.latencyMs != null ? `${a.latencyMs} ms` : 'live') : (a.liveness ?? 'not probed')}
              </div>
            ))}

            <div className={styles.rowLabel}>Tested</div>
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

            <div className={styles.rowLabel}>What it costs</div>
            {chosen.map((a) => (
              <div key={a.agentId} className={styles.cell}>
                {a.price ?? <span className={styles.muted}>price not advertised</span>}
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
          <ProvenanceChip provenance="MEASURED" /> Liveness and latency are our own probe. A
          warrant is a pass on the published MCS case; a failure names the field.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}
