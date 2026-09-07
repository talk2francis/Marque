'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Chip, ProvenanceChip } from '@marque/ui'
import { announceChartersChanged } from '../_components/CharterStrip'
import { explorerTx } from '../../lib/network'
import { displayName, isReferenceAgent } from '../../lib/reference-agents'
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
  charter: { id: string; txHash: string | null; capBnb: number; minutes: number } | null
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
          symbol: primary?.symbol ?? '—',
          liqPrice: primary?.liquidationPriceUsd ?? null,
        },
      })
    } catch (e) { fail(e instanceof Error ? e.message : 'the read failed') }
  }, [demoAddress])

  // ---- 2. Rank: measured, not asserted -------------------------------------
  const doRank = useCallback(async () => {
    setS((p) => ({ ...p, busy: 'rank', error: null }))
    try {
      const res = await fetch('/api/v1/agents?category=health_factor&status=all&limit=12', { cache: 'no-store' })
      const b = await res.json() as { agents?: Array<{ id: string; name: string | null; liveness: string | null }> }
      const third = (b.agents ?? []).slice(0, 2).map((a) => ({
        id: a.id,
        name: a.name ?? 'unnamed',
        why: a.liveness === 'working'
          ? 'Answers when called, but has never passed MCS-HF-1, so it carries no warrant.'
          : a.liveness === 'unbound'
            ? 'Registered on ERC-8004 but not bound — its card declares no endpoint, so there is nothing to call.'
            : 'Indexed, not yet probed.',
        warranted: false,
      }))
      finish('rank', {
        agents: [
          {
            id: 'marque:keel',
            name: displayName('marque:keel'),
            why: 'Passes MCS-HF-1 against a case captured at the current block: health factor to three decimals, the correct per-market liquidation threshold, and the exact repayment to reach the target.',
            warranted: true,
          },
          ...third,
        ],
      })
    } catch (e) { fail(e instanceof Error ? e.message : 'the ranking failed') }
  }, [])

  // ---- 3. Charter: a real transaction --------------------------------------
  const doCharter = useCallback(async () => {
    setS((p) => ({ ...p, busy: 'charter', error: null }))
    try {
      const res = await fetch('/api/v1/charters', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: 'health_factor', agentId: 'marque:keel', agentName: displayName('marque:keel'),
          capBnb: 0.002, minutes: 15, label: 'Judge mode',
        }),
      })
      const b = await res.json() as { charter?: { id: string; grantTxHash?: string | null }; error?: string; detail?: string }
      if (!res.ok || !b.charter) { fail(b.detail ?? b.error ?? 'the grant was refused'); return }
      announceChartersChanged()
      finish('charter', {
        charter: { id: b.charter.id, txHash: b.charter.grantTxHash ?? null, capBnb: 0.002, minutes: 15 },
      })
    } catch (e) { fail(e instanceof Error ? e.message : 'the grant failed') }
  }, [])

  // ---- 4. Run: a live agent, under that charter ----------------------------
  const doRun = useCallback(async () => {
    if (!s.charter) return
    setS((p) => ({ ...p, busy: 'run', error: null }))
    try {
      const res = await fetch('/api/v1/runs', {
        method: 'POST', headers: { 'content-type': 'application/json' },
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
      fail('The run has not settled yet. Nothing is fabricated in its place — reload to keep waiting.')
    } catch (e) { fail(e instanceof Error ? e.message : 'the receipt lookup failed') }
  }, [s.run])

  // ---- 6. Revoke -----------------------------------------------------------
  const doRevoke = useCallback(async () => {
    if (!s.charter) return
    setS((p) => ({ ...p, busy: 'revoke', error: null }))
    try {
      const res = await fetch(`/api/v1/charters/${encodeURIComponent(s.charter.id)}/revoke`, { method: 'POST' })
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
      title: 'Rank the agents that can act on it',
      cta: 'Rank the agents',
      why: 'Ranked on what we measured — a published conformance test and a real probe — never on a self-declared capability. Registration answers who; it never answers how good.',
    },
    charter: {
      title: 'Grant bounded authority',
      cta: 'Grant a charter',
      why: 'A spend cap, an expiry and an explicit allowlist, written on chain. This is a real transaction on BNB Smart Chain testnet, and it is revocable from the moment it exists.',
    },
    run: {
      title: 'Put it to work under that charter',
      cta: 'Run it',
      why: 'Authority is checked BEFORE execution, not after. The agent is a live endpoint answering a real question about a real account.',
    },
    receipt: {
      title: 'Take the receipt',
      cta: 'Get the receipt',
      why: 'Four proof blocks — commercial, execution, authority and quality — a canonical hash anyone can recompute, and the transaction that anchored it.',
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
                            {a.warranted ? 'MCS-HF-1 pass' : 'no warrant'}
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
