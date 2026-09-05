'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Statement, Chip, DataCell } from '@marque/ui'
import { scanAddress, scanTx } from '../../../lib/charter-templates'
import styles from './run.module.css'

/**
 * The Run Room.
 *
 * Five tabs, because "did it work" is five separate questions and a screen that
 * merges them is asking to be trusted rather than checked:
 *
 *   Activity      what happened, with the times it happened at
 *   Result        what the agent actually said
 *   Transactions  what landed on chain
 *   Authority     what it was allowed to do while it was doing it
 *   Evidence      the receipt hash and the raw payloads behind all of the above
 *
 * The only motion is a single 200ms brass pulse when a transaction is included.
 * The Seal is the one bold moment in this product; a run room that also
 * animates is a run room competing with it.
 */

interface RunRow {
  id: string
  agentId: string
  agentName: string | null
  kind: string
  category: string
  charterId: string | null
  subject: string
  chainId: number
  blockNumber: string
  task: Record<string, unknown>
  status: 'running' | 'complete' | 'failed'
  stage: string
  ok: boolean | null
  failure: string | null
  failureReason: string | null
  feeUsd: number | null
  maxSpendUsd: number
  latencyMs: number | null
  txHashes: string[]
  result: unknown
  startedAt: string
  finishedAt: string | null
}

interface EventRow {
  id: number
  runId: string
  at: string
  kind: string
  label: string
  detail: string | null
  txHash: string | null
  data: Record<string, unknown> | null
}

interface CharterSummary {
  id: string
  status: string
  agentName: string | null
  contracts: Array<{ to: string; label: string | null; selectors: string[] }>
  caps: Array<{ symbol: string; limit: number; spent: number; remaining: number }>
  expiresAt: string
  grantTxHash: string | null
  policyHash: string
  provider: string
}

type Tab = 'activity' | 'result' | 'transactions' | 'authority' | 'evidence'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'activity', label: 'Activity' },
  { id: 'result', label: 'Result' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'authority', label: 'Authority' },
  { id: 'evidence', label: 'Evidence' },
]

const KIND_LABEL: Record<string, string> = {
  quote: 'Quote', authority: 'Authority', execute: 'Execution', tx: 'Transaction',
  grade: 'Grade', receipt: 'Receipt', refused: 'Refused', error: 'Error',
}

function clock(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`
}

/** Milliseconds since the run started, so the timeline reads as elapsed time. */
function since(startedAt: string, at: string): string {
  const ms = new Date(at).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `+${ms}ms` : `+${(ms / 1000).toFixed(2)}s`
}

export function RunRoom({
  initial, charter,
}: {
  initial: { run: RunRow; events: EventRow[]; receipt: { id: string; hash: string } | null }
  charter: CharterSummary | null
}) {
  const [run, setRun] = useState(initial.run)
  const [events, setEvents] = useState(initial.events)
  const [receipt, setReceipt] = useState(initial.receipt)
  const [tab, setTab] = useState<Tab>('activity')
  const [pulseId, setPulseId] = useState<number | null>(null)
  const seenTx = useRef(new Set(initial.events.filter((e) => e.kind === 'tx').map((e) => e.id)))

  const running = run.status === 'running'

  /**
   * Anchoring happens a few seconds AFTER the run reports complete, because it
   * is a transaction. Stopping the poll the instant the status flips leaves the
   * anchor event invisible until someone reloads, so the poll runs on for a
   * short tail past the finish.
   */
  const [settling, setSettling] = useState(true)
  useEffect(() => {
    if (running) { setSettling(true); return }
    const stop = setTimeout(() => setSettling(false), 25_000)
    return () => clearTimeout(stop)
  }, [running])

  useEffect(() => {
    if (!running && !settling) return
    let cancelled = false
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/runs/${encodeURIComponent(run.id)}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { run: RunRow; events: EventRow[]; receipt: { id: string; hash: string } | null }
        if (cancelled) return
        // One 200ms brass pulse per transaction inclusion, and nothing else.
        const newTx = data.events.find((e) => e.kind === 'tx' && !seenTx.current.has(e.id))
        if (newTx) {
          seenTx.current.add(newTx.id)
          setPulseId(newTx.id)
          setTimeout(() => setPulseId(null), 200)
        }
        setRun(data.run)
        setEvents(data.events)
        setReceipt(data.receipt)
      } catch { /* a failed poll shows the last real state, never a guess */ }
    }, running ? 1200 : 3000)
    return () => { cancelled = true; clearInterval(poll) }
  }, [running, settling, run.id])

  const elapsed = useMemo(() => {
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now()
    return ((end - new Date(run.startedAt).getTime()) / 1000).toFixed(2)
  }, [run.startedAt, run.finishedAt])

  const grade = events.find((e) => e.kind === 'grade')

  return (
    <>
      <header className={styles.head}>
        <div className={styles.headMain}>
          <Statement as="h1">{run.agentName ?? run.agentId}</Statement>
          <p className={styles.headSub}>
            {run.category.replace('_', ' ')} · for{' '}
            <a href={scanAddress(run.subject)} target="_blank" rel="noreferrer" className="mono">
              {run.subject.slice(0, 10)}…{run.subject.slice(-6)}
            </a>{' '}
            · pinned to block <span className="mono">{run.blockNumber}</span>
          </p>
        </div>
        <div className={styles.headState}>
          {running
            ? <Chip tone="watch">Running</Chip>
            : run.ok
              ? <Chip tone="holds">Complete</Chip>
              : <Chip tone="breach">Failed</Chip>}
          <DataCell>{elapsed}s</DataCell>
        </div>
      </header>

      {run.failure && (
        <p className={styles.failure} role="status">
          {run.failure}
        </p>
      )}

      <nav className={styles.tabs} aria-label="Run detail">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.tab}
            aria-current={tab === t.id ? 'true' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'transactions' && run.txHashes.length > 0 && (
              <span className={`mono ${styles.tabCount}`}>{run.txHashes.length}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'activity' && (
        <ol className={styles.timeline}>
          {events.map((e) => (
            <li key={e.id} className={styles.event} data-kind={e.kind} data-pulse={pulseId === e.id ? 'true' : undefined}>
              <span className={`mono ${styles.eventTime}`} title={new Date(e.at).toISOString()}>
                {clock(e.at)}
              </span>
              <span className={`mono ${styles.eventSince}`}>{since(run.startedAt, e.at)}</span>
              <span className={styles.eventBody}>
                <span className={styles.eventKind}>{KIND_LABEL[e.kind] ?? e.kind}</span>
                <span className={styles.eventLabel}>{e.label}</span>
                {e.detail && <span className={styles.eventDetail}>{e.detail}</span>}
                {e.txHash && (
                  <a className={`mono ${styles.eventLink}`} href={scanTx(e.txHash)} target="_blank" rel="noreferrer">
                    {e.txHash}
                  </a>
                )}
              </span>
            </li>
          ))}
          {running && (
            <li className={styles.event} data-kind="pending">
              <span className={`mono ${styles.eventTime}`}>—</span>
              <span className={`mono ${styles.eventSince}`} />
              <span className={styles.eventBody}>
                <span className={styles.eventKind}>Waiting</span>
                <span className={styles.eventLabel}>the agent has not answered yet</span>
              </span>
            </li>
          )}
        </ol>
      )}

      {tab === 'result' && (
        <section className={styles.panel}>
          {run.result === null || run.result === undefined ? (
            <p className={styles.empty}>
              {running
                ? 'The agent has not answered yet.'
                : 'This run produced no answer. What stopped it is on the Activity tab, in the words the failure actually arrived in.'}
            </p>
          ) : (
            <>
              {grade && (
                <p className={styles.grade} data-pass={grade.data && (grade.data as { pass?: boolean }).pass ? 'true' : 'false'}>
                  {grade.label}
                  {grade.detail && <span className={styles.gradeDetail}>{grade.detail}</span>}
                </p>
              )}
              <pre className={`mono ${styles.json}`}>{JSON.stringify(run.result, null, 2)}</pre>
            </>
          )}
        </section>
      )}

      {tab === 'transactions' && (
        <section className={styles.panel}>
          {run.txHashes.length === 0 ? (
            <p className={styles.empty}>
              No transaction was submitted. This run asked the agent a question and graded the
              answer; nothing moved on chain, and the receipt says so.
            </p>
          ) : (
            <ul className={styles.txList}>
              {run.txHashes.map((h) => (
                <li key={h}>
                  <a className={`mono ${styles.txLink}`} href={scanTx(h)} target="_blank" rel="noreferrer">{h}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'authority' && (
        <section className={styles.panel}>
          {!charter ? (
            <p className={styles.empty}>
              This run held no charter, so it was permitted to touch no contract at all. That is the
              safe default and it is enforced before execution, not audited afterwards.
            </p>
          ) : (
            <>
              <dl className={styles.facts}>
                <div><dt>Charter</dt><dd><DataCell align="left">{charter.id}</DataCell></dd></div>
                <div><dt>State at read</dt><dd>{charter.status}</dd></div>
                <div><dt>Issued by</dt><dd>{charter.provider}</dd></div>
                <div><dt>Expires</dt><dd><DataCell align="left">{new Date(charter.expiresAt).toISOString().replace('T', ' ').slice(0, 19)}Z</DataCell></dd></div>
              </dl>
              <p className={styles.authorityNote}>
                {charter.provider === 'registry'
                  ? 'This charter’s policy is anchored on chain and publicly readable, and it is enforced by Marque before anything is signed. It is not enforced by a validator, and we do not claim otherwise.'
                  : 'This charter is enforced by the relay: a call outside its bounds is refused before inclusion rather than by us.'}
              </p>
              <h3 className={styles.subhead}>May call</h3>
              <ul className={styles.permitList}>
                {charter.contracts.map((c) => (
                  <li key={c.to}>
                    <a href={scanAddress(c.to)} target="_blank" rel="noreferrer">{c.label ?? c.to}</a>
                    <span className={`mono ${styles.selectors}`}>{c.selectors.length} function{c.selectors.length === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
              <h3 className={styles.subhead}>May spend</h3>
              <ul className={styles.permitList}>
                {charter.caps.map((c) => (
                  <li key={c.symbol}>
                    <span>{c.symbol}</span>
                    <span className={`mono ${styles.selectors}`}>{c.spent} of {c.limit} used</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === 'evidence' && (
        <section className={styles.panel}>
          <dl className={styles.facts}>
            <div><dt>Run</dt><dd><DataCell align="left">{run.id}</DataCell></dd></div>
            <div><dt>Started</dt><dd><DataCell align="left">{new Date(run.startedAt).toISOString()}</DataCell></dd></div>
            <div><dt>Stage reached</dt><dd>{run.stage}</dd></div>
            <div><dt>Ceiling for this run</dt><dd><DataCell align="left">{run.maxSpendUsd} USD</DataCell></dd></div>
          </dl>
          <h3 className={styles.subhead}>The task, exactly as it was sent</h3>
          <pre className={`mono ${styles.json}`}>{JSON.stringify(run.task, null, 2)}</pre>
          {receipt ? (
            <p className={styles.receiptLine}>
              <a className={styles.receiptLink} href={`/receipts/${receipt.id}`}>Open the receipt</a>
              <span className={`mono ${styles.hash}`}>{receipt.hash}</span>
            </p>
          ) : (
            <p className={styles.empty}>No receipt has been issued yet.</p>
          )}
        </section>
      )}
    </>
  )
}
