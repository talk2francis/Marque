'use client'

import { useState } from 'react'
import { Button, Chip, ProvenanceChip } from '@marque/ui'
import styles from '../builders.module.css'

interface Diff {
  field: string
  pass: boolean
  expected: string
  actual: string
  tolerance: string
  detail?: string
}

interface Result {
  testId: string
  pass: boolean
  error: string | null
  latencyMs: number
  caseId: string
  blockNumber: string
  diffs: Diff[]
  note: string
}

const TESTS = [
  { id: 'MCS-REB-1', label: 'Rebalancing — PancakeSwap V3 range' },
  { id: 'MCS-GRID-1', label: 'Grid trading — spacing, allocation, fee drag' },
  { id: 'MCS-YIELD-1', label: 'Yield — net APR at size, sourced' },
  { id: 'MCS-HF-1', label: 'Health factor — Venus, exact repay' },
] as const

/**
 * Reference endpoints, so a judge with no agent of their own can still watch a
 * real test run field by field (P10.5G item 5). These are Marque's own agents;
 * a run against them is labelled first-party on the Standard like any other.
 */
const REFERENCE_ENDPOINTS = [
  { slug: 'bound', name: 'Bound', cat: 'rebalancing', testId: 'MCS-REB-1' },
  { slug: 'lattice', name: 'Lattice', cat: 'grid trading', testId: 'MCS-GRID-1' },
  { slug: 'sluicegate', name: 'Sluicegate', cat: 'yield', testId: 'MCS-YIELD-1' },
  { slug: 'keel', name: 'Keel', cat: 'health factor', testId: 'MCS-HF-1' },
] as const
const refUrl = (slug: string) => `https://marque.trade/agents/${slug}/.well-known/agent-card.json`

export function TestForm() {
  const [endpoint, setEndpoint] = useState('')
  const [testId, setTestId] = useState<string>('MCS-REB-1')
  const [kind, setKind] = useState<'a2a' | 'mcp'>('a2a')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    setRunning(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/v1/builders/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint.trim(), testId, kind }),
      })
      const body = (await res.json()) as Result & { error?: string; detail?: string }
      if (!res.ok) { setError(body.detail ?? body.error ?? `run failed (${res.status})`); return }
      setResult(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the run failed')
    } finally {
      setRunning(false)
    }
  }

  const failed = result?.diffs.filter((d) => !d.pass) ?? []

  return (
    <>
      <form onSubmit={run}>
        <div className={styles.field}>
          <label htmlFor="endpoint">Your agent&rsquo;s endpoint</label>
          <input
            id="endpoint" type="url" required value={endpoint} spellCheck={false} autoComplete="off"
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://your-agent.example/.well-known/agent-card.json"
          />
          <span className={styles.hint}>
            For A2A, the agent card URL. We read the card and call the <code>url</code> inside it —
            posting at the card itself is a mistake that once looked like thirty dead agents and
            was a broken client.
          </span>
          <div className={styles.refRow}>
            <span className={styles.refLabel}>No agent of your own? Try a reference endpoint:</span>
            {REFERENCE_ENDPOINTS.map((r) => (
              <button
                key={r.slug}
                type="button"
                className={styles.refChip}
                onClick={() => { setEndpoint(refUrl(r.slug)); setKind('a2a'); setTestId(r.testId) }}
              >
                {r.name} <span className={styles.refCat}>{r.cat}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="kind">Interface</label>
          <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as 'a2a' | 'mcp')}>
            <option value="a2a">A2A — agent card and message/send</option>
            <option value="mcp">MCP — streamable HTTP</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="test">Category</label>
          <select id="test" value={testId} onChange={(e) => setTestId(e.target.value)}>
            {TESTS.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.label}</option>)}
          </select>
        </div>

        <div className={styles.actions}>
          <Button variant="primary" size="md" type="submit" disabled={running}>
            {running ? 'Capturing a case and running…' : 'Run the test'}
          </Button>
          {running && <span className={styles.note}>Reading chain state, then calling your endpoint.</span>}
        </div>
      </form>

      {error && <p className={styles.warn}>{error}</p>}

      {result && (
        <div className={styles.section}>
          <div className={styles.verdict}>
            <span className={`${styles.verdictWord} ${result.pass ? styles.pass : styles.fail}`}>
              {result.pass ? 'Pass' : 'Fail'}
            </span>
            <Chip tone="chain">{result.testId}</Chip>
            <span className={styles.note}>
              {result.latencyMs} ms · case {result.caseId} · block {result.blockNumber}
            </span>
          </div>

          {result.error ? (
            <p className={styles.warn}>
              Your endpoint did not produce an answer we could grade: {result.error}
              <br />
              Failing to answer is recorded as a different fact from answering wrongly, so no
              field diff is shown — there was nothing to compare.
            </p>
          ) : (
            <>
              <p className={styles.note}>
                <ProvenanceChip provenance="TESTED" />
                {failed.length === 0
                  ? `All ${result.diffs.length} checks passed.`
                  : `${failed.length} of ${result.diffs.length} checks failed. Failures are marked and listed first.`}
              </p>
              <table className={styles.diffs}>
                <thead>
                  <tr><th>Field</th><th>Expected</th><th>Your answer</th><th>Tolerance</th><th>Why it failed</th></tr>
                </thead>
                <tbody>
                  {[...failed, ...result.diffs.filter((d) => d.pass)].map((d) => (
                    <tr key={d.field} className={`${styles.diffRow} ${d.pass ? '' : styles.diffFail}`}>
                      <td className="mono">{d.field}</td>
                      <td className="mono">{d.expected}</td>
                      <td className="mono">{d.actual}</td>
                      <td className="mono">{d.tolerance}</td>
                      <td className="wrap">{d.pass ? '' : (d.detail ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p className={styles.note}>{result.note}</p>
        </div>
      )}
    </>
  )
}
