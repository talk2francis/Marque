import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Statement, Chip, DataCell } from '@marque/ui'
import { BRAND } from '@marque/ui/brand'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { readReceipt } from '../../../lib/runs'
import { scanAddress, scanTx } from '../../../lib/charter-templates'
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
  runId: string
  issuedAt: string
  task: Record<string, unknown> & { kind: string; subject: string; blockNumber: string; chainId: number }
  commercial: {
    agentId: string; executorKind: string; declaredPrice: string | null
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
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const row = await readReceipt(id).catch(() => null)
  if (!row) return { title: `Receipt not found · ${BRAND.name}` }
  const body = row.body as unknown as ReceiptBody
  const title = `Receipt ${row.hash.slice(0, 10)} · ${BRAND.name}`
  const description = body.execution.ok
    ? `A ${body.task.kind.replace('_', ' ')} run on BNB Smart Chain, graded against the published standard and hashed.`
    : `A ${body.task.kind.replace('_', ' ')} run that failed, published with the reason it failed.`
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
  const body = row.body as unknown as ReceiptBody

  const settled = body.commercial.settled
  const graded = body.quality.pass
  const anchored = Boolean(row.anchorTxHash)

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <div>
            <Statement as="h1" className={styles.title}>Receipt</Statement>
            <p className={styles.sub}>
              {body.task.kind.replace('_', ' ')} · agent{' '}
              <span className="mono">{body.commercial.agentId}</span> · issued{' '}
              <span className="mono">{new Date(body.issuedAt).toISOString().replace('T', ' ').slice(0, 19)}Z</span>
            </p>
          </div>
          {body.execution.ok
            ? <Chip tone="holds">Ran to completion</Chip>
            : <Chip tone="breach">Failed</Chip>}
        </header>

        <div className={styles.blocks}>
          <Block
            title="Commercial"
            verdict={settled ? 'Settled' : 'Not settled'}
            tone={settled ? 'holds' : 'neutral'}
          >
            <RowItem label="Agent asked">
              {body.commercial.declaredPrice ?? <span className={styles.absent}>no machine-readable price</span>}
            </RowItem>
            <RowItem label="Paid">
              {body.commercial.paidAmount === null
                ? <span className={styles.absent}>nothing was paid</span>
                : <DataCell align="left">{body.commercial.paidAmount} {body.commercial.paidAsset ?? ''}</DataCell>}
            </RowItem>
            <RowItem label="Buyer’s ceiling">
              <DataCell align="left">{body.commercial.maxSpendUsd} USD</DataCell>
            </RowItem>
            {body.commercial.settlementNote && (
              <RowItem label="Note">{body.commercial.settlementNote}</RowItem>
            )}
          </Block>

          <Block
            title="Execution"
            verdict={body.execution.ok ? 'Completed' : `Stopped: ${body.execution.failureReason ?? 'unknown'}`}
            tone={body.execution.ok ? 'holds' : 'breach'}
          >
            <RowItem label="Chain">
              <DataCell align="left">BNB Smart Chain · {body.execution.chainId}</DataCell>
            </RowItem>
            <RowItem label="Block">
              <DataCell align="left">{body.execution.blockNumber}</DataCell>
            </RowItem>
            <RowItem label="Subject">
              <a className="mono" href={scanAddress(body.task.subject)} target="_blank" rel="noreferrer">
                {body.task.subject}
              </a>
            </RowItem>
            <RowItem label="Took">
              <DataCell align="left">{body.execution.latencyMs} ms</DataCell>
            </RowItem>
            <RowItem label="Transactions">
              {body.execution.txHashes.length === 0
                ? <span className={styles.absent}>none — nothing moved on chain</span>
                : body.execution.txHashes.map((h) => (
                    <a key={h} className={`mono ${styles.txLink}`} href={scanTx(h)} target="_blank" rel="noreferrer">{h}</a>
                  ))}
            </RowItem>
          </Block>

          <Block
            title="Authority"
            verdict={body.authority.charterId ? 'Bounded by a charter' : 'Read-only'}
            tone={body.authority.withinAuthority ? 'holds' : 'breach'}
          >
            <RowItem label="Charter">
              {body.authority.charterId
                ? <DataCell align="left">{body.authority.charterId}</DataCell>
                : <span className={styles.absent}>none — no contract call was permitted</span>}
            </RowItem>
            <RowItem label="May have called">
              {body.authority.allowlist.length === 0
                ? <span className={styles.absent}>nothing</span>
                : body.authority.allowlist.map((a) => (
                    <a key={a} className={`mono ${styles.txLink}`} href={scanAddress(a)} target="_blank" rel="noreferrer">{a}</a>
                  ))}
            </RowItem>
            <RowItem label="Spend cap">
              <DataCell align="left">{body.authority.spendCapUsd} USD</DataCell>
            </RowItem>
            <RowItem label="Stayed inside it">
              {body.authority.withinAuthority ? 'Yes' : 'No'}
            </RowItem>
          </Block>

          <Block
            title="Quality"
            verdict={graded === null ? 'Not graded' : graded ? `Passed ${body.quality.testId}` : `Failed ${body.quality.testId}`}
            tone={graded === null ? 'neutral' : graded ? 'holds' : 'watch'}
          >
            {graded === null ? (
              <RowItem label="Why not">
                This hire asked a different question from the published case for its category, so
                grading it against that case would be meaningless in both directions — a correct
                answer would fail, and an agent that ignored the buyer would pass.
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
            SHA-256 over the canonical form of everything above — sorted keys, no incidental
            whitespace — so anyone holding the same content computes the same 32 bytes.
            {anchored
              ? ' It is written on MarqueRegistry, which proves this receipt existed at that block and has not been edited since. It does not prove the receipt is true, and we do not claim it does.'
              : ' It has not been anchored on chain, so its timestamp rests on our word alone. That is worth less, and saying so costs nothing.'}
          </p>
          <div className={styles.leafActions}>
            {row.anchorTxHash && (
              <a className={styles.verify} href={scanTx(row.anchorTxHash)} target="_blank" rel="noreferrer">
                Verify on BscScan
              </a>
            )}
            <a className={styles.raw} href={`/api/v1/receipts/${row.id}`}>The receipt as JSON</a>
            <a className={styles.raw} href={`/runs/${body.runId}`}>The run it came from</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
