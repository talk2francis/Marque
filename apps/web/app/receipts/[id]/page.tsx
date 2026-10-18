import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Statement, Chip, DataCell } from '@marque/ui'
import { BRAND } from '@marque/ui/brand'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { readReceipt } from '../../../lib/runs'
import { explorerAddress, explorerTx, network } from '../../../lib/network'
import { receiptEvidence } from '../../../lib/receipt-evidence'
import styles from './receipt.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The receipt. Public, permanent, and readable by someone who has never used
 * Marque.
 *
 * Four proof blocks, because "it worked" is four separate claims and a
 * marketplace that blurs them is asking to be trusted rather than checked:
 *
 *   commercial  what was agreed and what was paid
 *   execution   what actually happened on chain
 *   authority   what the agent was permitted to do at the time
 *   quality     whether the answer passed its own category's published test
 *
 * A block whose claim is empty says so in words. A receipt with four green
 * ticks and nothing behind them is worse than no receipt.
 */

interface ReceiptBody {
  version: string
  artifactType?: 'execution' | 'settlement' | 'failure'
  runId: string
  issuedAt: string
  task: Record<string, unknown> & { kind: string; subject: string; blockNumber: string; chainId: number }
  commercial: {
    agentId: string; executorKind: string; declaredPrice: string | null
    quoteStatus?: 'quoted' | 'free' | 'price_unknown' | 'failed'
    quoteProvenance?: 'protocol' | 'declared_metadata' | 'none'
    paidAmount: number | null; paidAsset: string | null; maxSpendUsd: number
    settled: boolean; settlementNote: string | null
  }
  execution: {
    chainId: number; blockNumber: string; txHashes: string[]
    startedAt: string; finishedAt: string; latencyMs: number
    ok: boolean; failureReason: string | null
  }
  authority: {
    charterId: string | null; allowlist: string[]
    spendCapUsd: number; expiresAt: string | null; withinAuthority: boolean
  }
  quality: {
    testId: string | null; pass: boolean | null
    failedFields: string[]; caseId: string | null; groundTruthHash: string | null
  }
  agentResponse: unknown
  failure?: { stage: string; class: string; detail: string } | null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const row = await readReceipt(id).catch(() => null)
  if (!row) return { title: `Receipt not found · ${BRAND.name}` }
  if (receiptEvidence(row).digest.status !== 'MATCH') return { title: `Receipt integrity unavailable · ${BRAND.name}`, robots: { index: false } }
  const body = row.body as unknown as ReceiptBody
  const title = `Receipt ${row.hash.slice(0, 10)} · ${BRAND.name}`
  const description = `A preserved ${body.task.kind.replaceAll('_', ' ')} receipt with matching content digest. Payment, authority and current quality require separate verification.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function Block({
  title, verdict, tone, children,
}: {
  title: string
  verdict: string
  tone: 'holds' | 'watch' | 'breach' | 'neutral'
  children: React.ReactNode
}) {
  return (
    <section className={styles.block} data-tone={tone}>
      <header className={styles.blockHead}>
        <h2 className={styles.blockTitle}>{title}</h2>
        <span className={styles.blockVerdict}>{verdict}</span>
      </header>
      <dl className={styles.rows}>{children}</dl>
    </section>
  )
}

function RowItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <dt className={styles.rowLabel}>{label}</dt>
      <dd className={styles.rowValue}>{children}</dd>
    </div>
  )
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await readReceipt(id)
  if (!row) notFound()
  const evidence = receiptEvidence(row)
  if (evidence.digest.status !== 'MATCH') return <><SiteHeader /><main className={styles.page}><h1>Receipt integrity unavailable</h1><p>The stored receipt failed its content check. Its claims are not displayed as evidence.</p><p>Content status: {evidence.digest.status}.</p><a href={`/api/v1/receipts/${row.id}`}>Inspect the preserved JSON and evidence</a></main><SiteFooter /></>
  const body = row.body as unknown as ReceiptBody
  const executionNet = network(body.execution.chainId)
  const issued = new Date(body.issuedAt)
  const issuedAt = Number.isFinite(issued.getTime()) ? issued.toISOString().replace('T', ' ').slice(0, 19) + 'Z' : 'Unavailable'

  const settled = body.commercial.settled
  const graded = body.quality.pass
  const anchored = Boolean(row.anchorTxHash)

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <div>
            <Statement as="h1" className={styles.title}>
              {body.artifactType === 'failure' ? 'Failure receipt' : body.artifactType === 'settlement' ? 'Settlement receipt' : 'Execution receipt'}
            </Statement>
            <p className={styles.sub}>
              {body.task.kind.replace('_', ' ')} · agent{' '}
              <span className="mono">{body.commercial.agentId}</span> · issued{' '}
              <span className="mono">{issuedAt}</span>
            </p>
          </div>
          {body.execution.ok
            ? <Chip tone="watch">Recorded run succeeded</Chip>
            : <Chip tone="breach">Failed</Chip>}
        </header>

        <p className={styles.leafNote}>Content digest matches the preserved receipt. The blocks below are recorded claims, not independent chain verification. Payment release, execution, asset authority, test freshness and operator independence have not been checked here.</p>
        <div className={styles.blocks}>
          <Block
            title="Commercial"
            verdict={settled ? 'Recorded as settled' : 'No settlement recorded'}
            tone="neutral"
          >
            <RowItem label="Quote">
              {body.commercial.quoteStatus === 'price_unknown'
                ? <span className={styles.absent}>Price unknown in this record</span>
                : body.commercial.quoteStatus ?? 'legacy receipt'}
            </RowItem>
            <RowItem label="Agent asked">
              {body.commercial.declaredPrice ?? <span className={styles.absent}>no machine-readable price</span>}
            </RowItem>
            <RowItem label="Recorded paid amount">
              {body.commercial.paidAmount === null
                ? <span className={styles.absent}>Payment amount not recorded; release unverified</span>
                : <DataCell align="left">{body.commercial.paidAmount} {body.commercial.paidAsset ?? ''}</DataCell>}
            </RowItem>
            <RowItem label="Recorded buyer ceiling">
              <DataCell align="left">{body.commercial.maxSpendUsd} USD</DataCell>
            </RowItem>
            {body.commercial.settlementNote && (
              <RowItem label="Note">{body.commercial.settlementNote}</RowItem>
            )}
          </Block>

          <Block
            title="Execution"
            verdict={body.execution.ok ? 'Recorded success' : `Stopped: ${body.execution.failureReason ?? 'unknown'}`}
            tone={body.execution.ok ? 'neutral' : 'breach'}
          >
            <RowItem label="Chain">
              <DataCell align="left">{executionNet.short}</DataCell>
            </RowItem>
            <RowItem label="Block">
              <DataCell align="left">{body.execution.blockNumber}</DataCell>
            </RowItem>
            <RowItem label="Subject">
              {explorerAddress(body.task.chainId, body.task.subject) ? <a className="mono" href={explorerAddress(body.task.chainId, body.task.subject)} target="_blank" rel="noreferrer">{body.task.subject}</a> : <span className="mono">{body.task.subject}</span>}
              <span>Recorded task chain: {network(body.task.chainId).short}</span>
            </RowItem>
            <RowItem label="Took">
              <DataCell align="left">{body.execution.latencyMs} ms</DataCell>
            </RowItem>
            <RowItem label="Transactions">
              {body.execution.txHashes.length === 0
                ? <span className={styles.absent}>No transaction hashes recorded; chain state not checked</span>
                : body.execution.txHashes.map((h) => (
                    explorerTx(body.execution.chainId, h) ? <a key={h} className={`mono ${styles.txLink}`} href={explorerTx(body.execution.chainId, h)} target="_blank" rel="noreferrer">{h}</a> : <span key={h} className="mono">{h}</span>
                  ))}
            </RowItem>
          </Block>

          <Block
            title="Authority"
            verdict="Recorded policy only"
            tone="neutral"
          >
            <RowItem label="Charter">
              {body.authority.charterId
                ? <DataCell align="left">{body.authority.charterId}</DataCell>
                : <span className={styles.absent}>No charter recorded; asset permissions unverified</span>}
            </RowItem>
            <RowItem label="Recorded allowlist">
              {body.authority.allowlist.length === 0
                ? <span className={styles.absent}>nothing</span>
                : body.authority.allowlist.map((a) => (
                    <span key={a} className={`mono ${styles.txLink}`}>{a}</span>
                  ))}
            </RowItem>
            <RowItem label="Recorded spend cap">
              <DataCell align="left">{body.authority.spendCapUsd} USD</DataCell>
            </RowItem>
            <RowItem label="Recorded policy check">
              {body.authority.withinAuthority ? 'Reported within bounds; native enforcement unverified' : 'Reported outside bounds'}
            </RowItem>
          </Block>

          <Block
            title="Quality"
            verdict={graded === null ? 'Not graded' : graded ? `Recorded pass: ${body.quality.testId}` : `Recorded failure: ${body.quality.testId}`}
            tone={graded === null ? 'neutral' : 'watch'}
          >
            {graded === null ? (
              <RowItem label="Why not">
No test verdict was preserved in this receipt. A different task, missing case or unavailable grader must not be inferred as a pass or failure.
              </RowItem>
            ) : (
              <>
                <RowItem label="Test"><DataCell align="left">{body.quality.testId}</DataCell></RowItem>
                <RowItem label="Case"><DataCell align="left">{body.quality.caseId}</DataCell></RowItem>
                <RowItem label="Ground truth">
                  <span className={`mono ${styles.hashInline}`}>{body.quality.groundTruthHash}</span>
                </RowItem>
                {body.quality.failedFields.length > 0 && (
                  <RowItem label="Failed on">{body.quality.failedFields.join(', ')}</RowItem>
                )}
              </>
            )}
          </Block>
        </div>

        {/* ---- The leaf. What is actually anchored, and what that proves. ---- */}
        <section className={styles.leaf}>
          <h2 className={styles.leafTitle}>The leaf</h2>
          <p className={`mono ${styles.leafHash}`}>{row.hash}</p>
          <p className={styles.leafNote}>
            The stored JSON passes the existing sorted-JSON SHA-256 content check. The digest covers the receipt JSON, not this page or the separate evidence projection. It does not authenticate the issuer or prove payment, quality, authority or current chain state.
            {anchored ? ' An anchor transaction reference is recorded, but its chain and contract were not preserved. Independent replay requires explicit references; do not infer the anchor chain from the execution chain.' : 'No anchor transaction reference was preserved. Chain anchoring is unverified.'}
          </p>
          <div className={styles.leafActions}>
            {row.anchorTxHash ? <span className={`mono ${styles.hashInline}`}>Recorded anchor hash: {row.anchorTxHash}. Anchor chain unknown.</span> : null}
            <a className={styles.raw} href={`/api/v1/receipts/${row.id}?format=bundle`}>Export content evidence</a>
            <a className={styles.raw} href={`/api/v1/receipts/${row.id}`}>The receipt as JSON</a>
            <a className={styles.raw} href={`/runs/${body.runId}`}>The run it came from</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
