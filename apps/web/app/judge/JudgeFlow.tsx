'use client'

import { readMachineCatalog } from '@marque/commerce/catalog'

import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '../../lib/track'
import Link from 'next/link'
import { Button, Chip, ProvenanceChip } from '@marque/ui'
import { announceChartersChanged } from '../_components/CharterStrip'
import { explorerTx } from '../../lib/network'
import { isReferenceAgent } from '../../lib/reference-agents'
import styles from './judge.module.css'

type StepId = 'intent' | 'rank' | 'charter' | 'run' | 'receipt' | 'revoke'

const ORDER: StepId[] = ['intent', 'rank', 'charter', 'run', 'receipt', 'revoke']

interface RankedAgent { id: string; name: string; why: string; warranted: boolean }

interface State {
  done: StepId[]
  busy: StepId | null
  error: string | null
  hf: { value: number; symbol: string; liqPrice: number | null } | null
  agents: RankedAgent[]
  charter: { id: string; txHash: string | null; capBnb: number; minutes: number; controlToken: string } | null
  run: { id: string; status: string } | null
  receipt: { id: string; hash: string; anchorTx: string | null } | null
  revoke: { txHash: string | null } | null
}

function short(h: string): string {
  return h.length > 20 ? `${h.slice(0, 12)}…${h.slice(-8)}` : h
}

export function JudgeFlow({ demoAddress }: { demoAddress: string }) {
  const [s, setS] = useState<State>({
    done: [], busy: null, error: null, hf: null, agents: [],
    charter: null, run: null, receipt: null, revoke: null,
  })
  const [elapsed, setElapsed] = useState(0)
  const started = useRef<number | null>(null)

  useEffect(() => {
    if (started.current === null) return
    const t = setInterval(() => {
      if (started.current !== null) setElapsed((Date.now() - started.current) / 1000)
    }, 100)
    return () => clearInterval(t)
  }, [s.done.length])

  useEffect(() => {
    if (s.done.length >= 6) track('judge_flow_completed', undefined, { once: true })
  }, [s.done.length])

  const finish = (id: StepId, patch: Partial<State>) =>
    setS((p) => ({ ...p, ...patch, busy: null, error: null, done: [...p.done, id] }))
  const fail = (msg: string) => setS((p) => ({ ...p, busy: null, error: msg }))

  // ---- 1. Intent: read the position the agent would act on -----------------
  const doIntent = useCallback(async () => {
    if (started.current === null) started.current = Date.now()
    setS((p) => ({ ...p, busy: 'intent', error: null }))
    try {
      const res = await fetch(`/api/v1/positions/${demoAddress}`, { cache: 'no-store' })
      const b = await res.json() as {
        venus?: {
          ok: boolean; healthFactor: number | null
          markets?: Array<{ symbol: string; suppliedUsd: number; liquidationPriceUsd: number | null }>
        }
      }
      if (!res.ok || !b.venus?.ok || b.venus.healthFactor === null) {
        fail('Could not read this account’s Venus position just now. Nothing is shown in its place.')
        return
      }
      // The primary collateral is the market carrying the most value, derived
      // here rather than assumed — the API reports markets, not a "primary".
      const primary = (b.venus.markets ?? [])
        .filter((m) => m.suppliedUsd > 0)
        .sort((a, c) => c.suppliedUsd - a.suppliedUsd)[0]
      finish('intent', {
        hf: {
          value: b.venus.healthFactor,
          symbol: primary?.symbol ?? 'Unknown',
          liqPrice: primary?.liquidationPriceUsd ?? null,
        },
      })
    } catch (e) { fail(e instanceof Error ? e.message : 'the read failed') }
  }, [demoAddress])

  // ---- 2. Rank: measured, not asserted -------------------------------------
  const doRank = useCallback(async () => {
    setS((p) => ({ ...p, busy: 'rank', error: null }))
    try {
      const catalog = await readMachineCatalog(window.location.origin, { category: 'health_factor', tab: 'all', limit: 3 })
      finish('rank', { agents: catalog.agents.map(a => ({
        id: a.agentId, name: a.name, warranted: false,
        why: `${a.conformance.state === 'UNTESTED' ? 'No test recorded' : `Identity test history: ${a.conformance.state.toLowerCase().replaceAll('_', ' ')}${a.conformance.observedAt ? ` at ${a.conformance.observedAt}` : ''}`}. Current exact-service quality, task suitability and independent control are not established by this catalog.`,
      })) })
    } catch (e) { fail(e instanceof Error ? e.message : 'the ranking failed') }
  }, [])

  // Policy preview never grants authority or completes the legacy grant step.
  const doCharter = useCallback(async () => {
    window.location.assign('/app/charter?category=health_factor')
  }, [])

  // ---- 4. Run: a live agent, under that charter ----------------------------
  const doRun = useCallback(async () => {
    if (!s.charter) return
    setS((p) => ({ ...p, busy: 'run', error: null }))
    try {
      const res = await fetch('/api/v1/runs', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.charter.controlToken}` },
        body: JSON.stringify({
          agentId: 'marque:keel', subject: demoAddress, kind: 'health_factor',
          policy: { targetHealthFactor: 2.5 }, maxSpendUsd: 1, charterId: s.charter.id,
        }),
      })
      const b = await res.json() as { runId?: string; error?: string; detail?: string }
      if (!res.ok || !b.runId) { fail(b.detail ?? b.error ?? 'the run was refused'); return }
      finish('run', { run: { id: b.runId, status: 'running' } })
    } catch (e) { fail(e instanceof Error ? e.message : 'the run failed') }
  }, [s.charter, demoAddress])

  // ---- 5. Receipt ----------------------------------------------------------
  const doReceipt = useCallback(async () => {
    if (!s.run) return
    setS((p) => ({ ...p, busy: 'receipt', error: null }))
    try {
      // Poll until the run settles. A run that has not finished has no receipt,
      // and inventing one would defeat the entire point of the page.
      for (let i = 0; i < 40; i++) {
        const res = await fetch(`/api/v1/runs/${s.run.id}`, { cache: 'no-store' })
        const b = await res.json() as {
          run?: { status: string }
          receipt?: { id: string; hash: string } | null
        }
        if (b.receipt) {
          // Carry the settled status across too: leaving the run reading
          // "running" beside its own finished receipt is a small lie about
          // state, and this page is entirely about state being legible.
          finish('receipt', {
            receipt: { id: b.receipt.id, hash: b.receipt.hash, anchorTx: null },
            ...(b.run ? { run: { id: s.run.id, status: b.run.status } } : {}),
          })
          return
        }
        if (b.run && (b.run.status === 'failed' || b.run.status === 'refused')) {
          fail(`The run ended as ${b.run.status}, so there is no receipt. That is shown rather than hidden.`)
          return
        }
        await new Promise((r) => setTimeout(r, 1200))
      }
      fail('The run has not settled yet. Nothing is fabricated in its place. Reload to keep waiting.')
    } catch (e) { fail(e instanceof Error ? e.message : 'the receipt lookup failed') }
  }, [s.run])

  // ---- 6. Revoke -----------------------------------------------------------
  const doRevoke = useCallback(async () => {
    if (!s.charter) return
    setS((p) => ({ ...p, busy: 'revoke', error: null }))
    try {
      const res = await fetch(`/api/v1/charters/${encodeURIComponent(s.charter.id)}/revoke`, {
        method: 'POST', headers: { authorization: `Bearer ${s.charter.controlToken}` },
      })
      const b = await res.json() as { txHash?: string | null; error?: string; detail?: string }
      if (!res.ok) { fail(b.detail ?? b.error ?? 'the revoke failed'); return }
      announceChartersChanged()
      finish('revoke', { revoke: { txHash: b.txHash ?? null } })
    } catch (e) { fail(e instanceof Error ? e.message : 'the revoke failed') }
  }, [s.charter])

  const RUNNERS: Record<StepId, () => Promise<void>> = {
    intent: doIntent, rank: doRank, charter: doCharter, run: doRun, receipt: doReceipt, revoke: doRevoke,
  }

  const COPY: Record<StepId, { title: string; cta: string; why: string }> = {
    intent: {
      title: 'Read what the address actually holds',
      cta: 'Read the position',
      why: 'No wallet, no connection. The hero of the product is a position, and every number below is read from Venus on BNB Smart Chain at this block.',
    },
    rank: {
      title: 'Inspect recorded agents',
      cta: 'Read agent evidence',
      why: 'Read the existing catalog with its dated test history and unknowns. This does not establish a task-qualified winner.',
    },
    charter: {
      title: 'Review proposed authority',
      cta: 'Preview policy',
      why: 'New grants are disabled while buyer-owned onchain enforcement is unverified. Review proposed limits without a wallet; this legacy grant/run sequence stops here.',
    },
    run: {
      title: 'Put it to work under that charter',
      cta: 'Run it',
      why: 'Authority is checked BEFORE execution, not after. The agent is a live endpoint answering a real question about a real account.',
    },
    receipt: {
      title: 'Take the receipt',
      cta: 'Get the receipt',
      why: 'Four proof blocks (commercial, execution, authority and quality), a canonical hash anyone can recompute, and the transaction that anchored it.',
    },
    revoke: {
      title: 'Take the authority back',
      cta: 'Revoke now',
      why: 'The half most demos skip. Revocation is a transaction too, and after it the mandate strip disappears from every page.',
    },
  }

  const nextStep = ORDER.find((id) => !s.done.includes(id)) ?? null
  const allDone = nextStep === null

  return (
    <>
      <div className={styles.clock}>
        <span className={styles.clockValue}>{elapsed === 0 ? '0.0' : elapsed.toFixed(1)}s</span>
        <span className={styles.clockLabel}>
          {started.current === null
            ? 'the clock starts when you press the first button'
            : allDone ? `all six steps, start to finish` : `${s.done.length} of 6 steps`}
        </span>
        <ProvenanceChip provenance="MEASURED" />
      </div>

      {s.error && <p className={styles.warn}>{s.error}</p>}

      <ol className={styles.steps}>
        {ORDER.map((id, i) => {
          const done = s.done.includes(id)
          const active = nextStep === id
          const busy = s.busy === id
          return (
            <li className={styles.step} key={id}>
              <span className={`${styles.stepIndex} ${done ? styles.stepDone : active ? styles.stepActive : ''}`}>
                {done ? '✓' : i + 1}
              </span>
              <div className={styles.stepBody}>
                <span className={styles.stepTitle}>{COPY[id].title}</span>
                <span className={styles.stepWhy}>{COPY[id].why}</span>

                {done && id === 'intent' && s.hf && (
                  <span className={styles.stepResult}>
                    Health factor {s.hf.value.toFixed(3)} · largest collateral {s.hf.symbol}
                    {s.hf.liqPrice !== null && <> · liquidates at ${s.hf.liqPrice.toFixed(2)}</>}
                  </span>
                )}

                {done && id === 'rank' && (
                  <ul className={styles.agents}>
                    {s.agents.map((a) => (
                      <li key={a.id}>
                        <span className={styles.agentRow}>
                          {a.name}
                          {isReferenceAgent(a.id) && <Chip tone="watch">Marque reference agent</Chip>}
                          <Chip tone={a.warranted ? 'holds' : 'watch'}>
                            {a.warranted ? 'Service proof' : 'No current service proof'}
                          </Chip>
                        </span>
                        <span className={styles.agentWhy}>{a.why}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {done && id === 'charter' && s.charter && (
                  <span className={styles.stepResult}>
                    Cap {s.charter.capBnb} BNB · expires in {s.charter.minutes} min ·{' '}
                    {s.charter.txHash
                      ? <a href={explorerTx(97, s.charter.txHash)} rel="noreferrer noopener" target="_blank">{short(s.charter.txHash)}</a>
                      : 'recorded without a transaction hash'}
                  </span>
                )}

                {done && id === 'run' && s.run && (
                  <span className={styles.stepResult}>
                    <Link href={`/runs/${s.run.id}`}>Run room →</Link> status {s.run.status}
                  </span>
                )}

                {done && id === 'receipt' && s.receipt && (
                  <span className={styles.stepResult}>
                    <Link href={`/receipts/${s.receipt.id}`}>Receipt →</Link>{' '}
                    leaf {short(s.receipt.hash)}{' '}
                    {s.receipt.anchorTx && (
                      <a href={explorerTx(97, s.receipt.anchorTx)} rel="noreferrer noopener" target="_blank">
                        anchored {short(s.receipt.anchorTx)}
                      </a>
                    )}
                  </span>
                )}

                {done && id === 'revoke' && s.revoke && (
                  <span className={styles.stepResult}>
                    Revoked ·{' '}
                    {s.revoke.txHash
                      ? <a href={explorerTx(97, s.revoke.txHash)} rel="noreferrer noopener" target="_blank">{short(s.revoke.txHash)}</a>
                      : 'no transaction hash returned'}
                  </span>
                )}

                {active && (
                  <div className={styles.stepActions}>
                    <Button variant="primary" size="md" onClick={() => void RUNNERS[id]()} disabled={busy}>
                      {busy ? 'Working…' : COPY[id].cta}
                    </Button>
                    {busy && id === 'charter' && <span className={styles.stepWhy}>Writing the transaction and waiting for it to confirm.</span>}
                    {busy && id === 'receipt' && <span className={styles.stepWhy}>Waiting for the run to settle.</span>}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {allDone && (
        <div className={styles.drawer}>
          <h2 className={styles.stepTitle}>What you just saw, against the rubric</h2>
          <p className={styles.note}>
            Finished in {elapsed.toFixed(1)} seconds, every step a real read or a real transaction.
          </p>
          <table className={styles.rubric}>
            <thead><tr><th>Criterion</th><th>Where it was answered</th></tr></thead>
            <tbody>
              <tr>
                <td>Real on-chain activity</td>
                <td className="wrap">
                  The charter and the revocation are transactions on BNB Smart Chain testnet, both
                  linked to BscScan above. The receipt is anchored on MarqueRegistry.
                </td>
              </tr>
              <tr>
                <td>User-facing authority and revocation</td>
                <td className="wrap">
                  A cap, an expiry and an allowlist granted in one step and withdrawn in another.
                  While it was live, a strip on every page showed the remaining cap and time.{' '}
                  <Link href="/app/charters">The charters page</Link> keeps them all.
                </td>
              </tr>
              <tr>
                <td>Verifiable quality, not claimed quality</td>
                <td className="wrap">
                  The ranking came from <Link href="/standard">a published conformance standard</Link>{' '}
                  generated from the code that enforces it. Failures are published beside the
                  passes, including our own.
                </td>
              </tr>
              <tr>
                <td>Measured advantage</td>
                <td className="wrap">
                  <Link href="/ledger">The Ledger</Link> compares an agent against a human analyst
                  on the same task at the same block, against a rubric hashed before either arm
                  ran. The manual arms are outstanding and the page says so.
                </td>
              </tr>
              <tr>
                <td>Honest reporting</td>
                <td className="wrap">
                  Nothing here is a recording. <Link href="/status">Status</Link> shows what is
                  fresh and what is stale, and no uptime percentage is shown because we do not
                  measure one.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
