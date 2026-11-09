'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@marque/ui'
import { testName } from '../../../lib/builder-journey'
import { track } from '../../../lib/track'
import styles from './testform.module.css'

interface Diff {
  field: string
  pass: boolean
  expected: string
  actual: string
  tolerance: string
  detail?: string
}

export interface BenchResult {
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
  { id: 'MCS-REB-1', label: 'PancakeSwap V3 range' },
  { id: 'MCS-GRID-1', label: 'spacing, allocation, fee drag' },
  { id: 'MCS-YIELD-1', label: 'net APR at size, sourced' },
  { id: 'MCS-HF-1', label: 'Venus, exact repay' },
  { id: 'MCS-RYIELD-1', label: 'Venus rates between archived blocks' },
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
  { slug: 'tidemark', name: 'Tidemark', cat: 'realised yield', testId: 'MCS-RYIELD-1' },
] as const
const refUrl = (slug: string) => `https://marque.trade/agents/${slug}/.well-known/agent-card.json`
/** "healthFactor" -> "Health factor": a field as a person reads it (the exact key stays in the full table). */
const words = (f: string) => f.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])(?=[a-z])/g, (m) => m.toLowerCase())

/**
 * The Bench test (SPEC-BUILDERS 6): three steps, then a verdict. Where it goes, permission to send it, run.
 * The settings that are almost always right (interface, test) are shown as one line with Change; the long
 * explanations sit behind "What happens?" and "What goes here?".
 */
export function TestForm({ initialEndpoint = '', initialTestId = 'MCS-REB-1', initialKind = 'a2a', onResult, showReference = true }: {
  initialEndpoint?: string; initialTestId?: string; initialKind?: 'a2a' | 'mcp'; onResult?: (result: BenchResult) => void
  /** Offer Marque's reference agents as targets (off in My Marque, where the builder tests their own). */
  showReference?: boolean
}) {
  const [endpoint, setEndpoint] = useState(initialEndpoint)
  const [testId, setTestId] = useState<string>(initialTestId)
  const [kind, setKind] = useState<'a2a' | 'mcp'>(initialKind)
  const [taskConsent, setTaskConsent] = useState(false)
  const [changing, setChanging] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BenchResult | null>(null)
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
      const body = (await res.json()) as BenchResult & { error?: string; detail?: string }
      if (!res.ok) { setError(body.detail ?? body.error ?? `The test could not run (${res.status}).`); return }
      setResult(body)
      onResult?.(body)
      track('builder_test_run', { test: testId })
      track('preflight_run', { via: 'builders' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The test could not run.')
    } finally {
      setRunning(false)
    }
  }

  const failed = result?.diffs.filter((d) => !d.pass) ?? []
  const test = TESTS.find((t) => t.id === testId)

  return (
    <div className={styles.tf}>
      <form onSubmit={run}>
        <ol className={styles.steps}>
          <li>
            <span className={styles.num} aria-hidden="true">1</span>
            <div className={styles.stepBody}>
              <label htmlFor="endpoint" className={styles.stepTitle}>Where we send the task</label>
              <input
                id="endpoint" type="url" required value={endpoint} spellCheck={false} autoComplete="off" className={styles.input}
                onChange={(e) => { setEndpoint(e.target.value); setTaskConsent(false) }}
                placeholder="https://your-agent.example/.well-known/agent-card.json"
              />
              <div className={styles.settings}>
                <span><b>{kind === 'a2a' ? 'A2A' : 'MCP'}</b> · <b>{testName(testId)}</b>{test ? <span className={styles.muted}> ({test.label})</span> : null}</span>
                <button type="button" className={styles.textBtn} aria-expanded={changing} onClick={() => setChanging((v) => !v)}>{changing ? 'Done' : 'Change'}</button>
              </div>
              {changing ? (
                <div className={styles.selects}>
                  <label>How it talks
                    <select value={kind} onChange={(e) => { setTaskConsent(false); setKind(e.target.value as 'a2a' | 'mcp') }}>
                      <option value="a2a">A2A (agent card, message/send)</option>
                      <option value="mcp">MCP (streamable HTTP)</option>
                    </select>
                  </label>
                  <label>Which test
                    <select value={testId} onChange={(e) => { setTaskConsent(false); setTestId(e.target.value) }}>
                      {TESTS.map((t) => <option key={t.id} value={t.id}>{testName(t.id)}: {t.label}</option>)}
                    </select>
                  </label>
                </div>
              ) : null}
              <details className={styles.more}>
                <summary>What goes here?</summary>
                <p>For A2A, your agent card&apos;s address (it usually ends in <code>/.well-known/agent-card.json</code>). We read the card and send the task to the <code>url</code> written inside it. For MCP, the server&apos;s streamable HTTP address.</p>
              </details>
            </div>
          </li>
          <li>
            <span className={styles.num} aria-hidden="true">2</span>
            <div className={styles.stepBody}>
              <label className={styles.consent}>
                <input type="checkbox" checked={taskConsent} onChange={(e) => setTaskConsent(e.target.checked)} />
                <span>I run this agent, or have permission to test it, and it answers tests without asking for payment.</span>
              </label>
              <details className={styles.more}>
                <summary>What happens when I run it?</summary>
                <p>We capture a real case from the chain, send your agent one task about it, and compare each field of its answer with what the chain says. Nothing is paid, nothing is signed, and no money or asset moves. The result is private to this page: it does not change your agent&apos;s public record.</p>
              </details>
            </div>
          </li>
          <li>
            <span className={styles.num} aria-hidden="true">3</span>
            <div className={styles.stepBody}>
              <div className={styles.runRow}>
                <Button variant="primary" size="md" type="submit" disabled={running || !taskConsent || !endpoint.trim()}>
                  {running ? 'Testing…' : 'Run the test'}
                </Button>
                <span className={styles.muted} aria-live="polite">{running ? 'Reading the chain, then asking your agent. Usually under a minute.' : !taskConsent ? 'Tick step 2 first.' : ''}</span>
              </div>
            </div>
          </li>
        </ol>
      </form>

      {showReference ? (
        <details className={styles.more}>
          <summary>No agent of your own? Try one of Marque&apos;s</summary>
          <div className={styles.refRow}>
            {REFERENCE_ENDPOINTS.map((r) => (
              <button key={r.slug} type="button" className={styles.refChip}
                onClick={() => { setTaskConsent(false); setEndpoint(refUrl(r.slug)); setKind('a2a'); setTestId(r.testId) }}>
                {r.name} <span>{r.cat}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {result ? (
        <section className={styles.result} data-pass={result.pass ? 'true' : 'false'} aria-live="polite">
          <div className={styles.verdict}>
            <span className={styles.verdictIcon} aria-hidden="true">{result.pass ? <Check /> : <X />}</span>
            <div>
              <h3>{result.error ? 'No answer we could check' : result.pass ? 'Passed' : 'Did not pass'}</h3>
              <p>{result.error
                ? 'Your agent did not send back an answer we could compare. That is recorded as no answer, which is different from a wrong one.'
                : failed.length === 0 ? `All ${result.diffs.length} checks matched the chain.` : `${failed.length} of ${result.diffs.length} checks did not match. Fix these first:`}</p>
            </div>
          </div>
          {result.error ? <p className={styles.errText}>{result.error}</p> : null}
          {failed.length ? (
            <ul className={styles.fails}>
              {failed.map((d) => (
                <li key={d.field}>
                  <b>{words(d.field)}</b>
                  <span>Expected <code>{d.expected}</code>, got <code>{d.actual}</code>{d.tolerance ? <span className={styles.muted}> (allowed: {d.tolerance})</span> : null}</span>
                  {d.detail ? <span className={styles.muted}>{d.detail}</span> : null}
                  {HINT[d.field] ? <span className={styles.hint}>How to fix: {HINT[d.field]}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.meta}>{testName(result.testId)} · answered in {result.latencyMs.toLocaleString('en-US')} ms · case {result.caseId} at block {Number(result.blockNumber).toLocaleString('en-US')}</p>
          {result.diffs.length ? (
            <details className={styles.more}>
              <summary>All {result.diffs.length} checks</summary>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Field</th><th>Expected</th><th>Your answer</th><th>Allowed</th><th>Result</th></tr></thead>
                  <tbody>
                    {[...failed, ...result.diffs.filter((d) => d.pass)].map((d) => (
                      <tr key={d.field} data-pass={d.pass ? 'true' : 'false'}>
                        <td className="mono">{d.field}</td><td className="mono">{d.expected}</td><td className="mono">{d.actual}</td><td className="mono">{d.tolerance}</td><td>{d.pass ? 'Matches' : 'Differs'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.note ? <p className={styles.muted}>{result.note}</p> : null}
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
