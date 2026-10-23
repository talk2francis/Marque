'use client'

import { useState } from 'react'
import { Button, Chip, ProvenanceChip } from '@marque/ui'
import styles from '../builders.module.css'
import { track } from '../../../lib/track'

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

/** One line per assertion on how to fix it (SPEC-BUILDERS 6.2). Keyed by the Standard's tolerance ids. */
const HINT: Record<string, string> = {
  healthFactor: 'Sum collateral USD x collateral factor across markets entered, divide by total borrow USD, at the case block. Round to 3 dp.',
  collateralFactor: 'Read markets(vToken).collateralFactorMantissa / 1e18 for the largest collateral market.',
  repayToTarget: 'Solve weighted collateral / (debt - repay) = target for repay; 0 when the account is already at or above the target.',
  liquidationPrice: 'The price at which the primary collateral alone brings the health factor to 1, other prices held.',
  primaryCollateralSymbol: 'The underlying symbol of the market with the largest collateral USD.',
  currentTick: 'Read slot0().tick from the position\'s pool at the case block.',
  inRange: 'tickLower <= tick < tickUpper, from positions(tokenId) and slot0.',
  distanceToBound: 'Percent from spot to the nearer bound, by price, not by tick count.',
  proposedTickSpacing: 'Ticks must be multiples of the pool\'s tickSpacing: 50 on the 0.25% tier, 10 on 0.05%, 1 on 0.01%, 200 on 1%.',
  amounts: 'Use the V3 liquidity formula with the position\'s liquidity across the proposed range.',
  slippageBound: 'State maxSlippageBps as a number.',
  levelSpacing: 'Return levels as [{ price, allocationUsd }] and declare spacingType; arithmetic levels share one difference.',
  feeDragDisclosed: 'Disclose feeDragPct from the fee per trade and the trades the grid implies.',
  improvementThreshold: 'State recommend: true or false. Silence is not a decision.',
  netApr: 'Net of fees at the stated size, from the protocol\'s own rate at the case block.',
  aprProvenance: 'Give each APR a source and timestamp.',
  switchingCost: 'Itemise gasUsd, swapUsd and exitUsd.',
  policyRange: 'Centre the range on spot at the policy\'s +/- percent, within one tick spacing.',
  allocationSum: 'The level allocations must add up to no more than the capital.',
  levelsWithinBounds: 'Every level price inside the lower and upper bound.',
  levelsAboveStop: 'No level at or below the stop price.',
  leverageFlagged: 'Set usesLeverage, and never recommend leverage when the case excludes it.',
}

const TESTS = [
  { id: 'MCS-REB-1', label: 'Rebalancing: PancakeSwap V3 range' },
  { id: 'MCS-GRID-1', label: 'Grid trading: spacing, allocation, fee drag' },
  { id: 'MCS-YIELD-1', label: 'Yield: net APR at size, sourced' },
  { id: 'MCS-HF-1', label: 'Health factor: Venus, exact repay' },
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
  const [taskConsent, setTaskConsent] = useState(false)
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
        body: JSON.stringify({ endpoint: endpoint.trim(), testId, kind, taskConsent }),
      })
      const body = (await res.json()) as Result & { error?: string; detail?: string }
      if (!res.ok) { setError(body.detail ?? body.error ?? `run failed (${res.status})`); return }
      setResult(body)
      track('builder_test_run', { test: testId })
      track('preflight_run', { via: 'builders' })
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
        <p className={styles.note}>This tool sends a real A2A or MCP task. It does not pay an agent or authorize asset actions. Use only an endpoint you control or have permission to test, configured to accept this task without payment or other side effects.</p>
        <label className={styles.note}><input type="checkbox" checked={taskConsent} onChange={e => setTaskConsent(e.target.checked)} /> I have permission and this endpoint accepts the test without payment or other side effects.</label>
        <div className={styles.field}>
          <label htmlFor="endpoint">Your agent&rsquo;s endpoint</label>
          <input
            id="endpoint" type="url" required value={endpoint} spellCheck={false} autoComplete="off"
            onChange={(e) => { setEndpoint(e.target.value); setTaskConsent(false) }}
            placeholder="https://your-agent.example/.well-known/agent-card.json"
          />
          <span className={styles.hint}>
            For A2A, the agent card URL. We read the card and call the <code>url</code> inside it: posting at the card itself is a mistake that once looked like thirty dead agents and
            was a broken client.
          </span>
          <div className={styles.refRow}>
            <span className={styles.refLabel}>No agent of your own? Try a reference endpoint:</span>
            {REFERENCE_ENDPOINTS.map((r) => (
              <button
                key={r.slug}
                type="button"
                className={styles.refChip}
                onClick={() => { setTaskConsent(false); setEndpoint(refUrl(r.slug)); setKind('a2a'); setTestId(r.testId) }}
              >
                {r.name} <span className={styles.refCat}>{r.cat}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="kind">Interface</label>
          <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as 'a2a' | 'mcp')}>
            <option value="a2a">A2A: agent card and message/send</option>
            <option value="mcp">MCP: streamable HTTP</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="test">Category</label>
          <select id="test" value={testId} onChange={(e) => setTestId(e.target.value)}>
            {TESTS.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.label}</option>)}
          </select>
        </div>

        <div className={styles.actions}>
          <Button variant="primary" size="md" type="submit" disabled={running || !taskConsent}>
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
              field diff is shown: there was nothing to compare.
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
                      <td className="wrap">{d.pass ? '' : <>{d.detail ?? ''}{HINT[d.field] ? <span className={styles.hint}>{HINT[d.field]}</span> : null}</>}</td>
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
