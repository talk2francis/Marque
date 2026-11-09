'use client'
import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Check, Download, X } from 'lucide-react'
import type { BuilderAgent, BuilderPage } from '../../lib/builder-workspace'
import { testName, when } from '../../lib/builder-journey'
import { TestForm, type BenchResult } from '../builders/test/TestForm'
import { AnswerReplay } from '../builders/AnswerReplay'
import type { ReplayTarget } from '../../lib/bench-replay'
import { AgentAvatar } from '../_components/AgentAvatar'
import { Button, Skeleton } from '../_components/ui'
import styles from '../builders/bench.module.css'

/**
 * The Workshop's Test bench: send your own agent a practice task and see, field by field, whether its answer
 * matches the chain. Private and free; published results and paid-job misses sit beside it so a fix can be tried
 * against the exact case that failed. Every rule from before holds (permission before any call, private runs only
 * in this browser, published records untouched); the words now say them once, plainly.
 */
const Check0 = z.object({ key: z.string(), label: z.string(), state: z.string(), agent: z.string().nullable(), marque: z.string().nullable(), how: z.string(), detail: z.string().nullable() })
const History = z.object({ agentId: z.string(), standard: z.string().nullable(), observedAt: z.string().datetime(),
  tests: z.array(z.object({ id: z.number(), testId: z.string(), caseId: z.string().nullable(), pass: z.boolean(), at: z.string().nullable(), block: z.string().nullable(), failedFields: z.unknown() })).max(20),
  misses: z.array(z.object({ chainId: z.union([z.literal(56), z.literal(97)]), jobId: z.string(), block: z.string().nullable(), checks: z.array(Check0) })).max(20),
})
type LocalRun = { receivedAt: string; result: BenchResult }
const LocalRuns = z.array(z.object({ receivedAt: z.string().datetime(), result: z.object({ testId: z.string(), pass: z.boolean(), error: z.string().nullable(), latencyMs: z.number().finite(), caseId: z.string(), blockNumber: z.string(), note: z.string(), diffs: z.array(z.object({ field: z.string(), pass: z.boolean(), expected: z.string(), actual: z.string(), tolerance: z.string(), detail: z.string().optional() })) }) }))
const standards = new Set(['MCS-HF-1', 'MCS-REB-1', 'MCS-GRID-1', 'MCS-YIELD-1', 'MCS-RYIELD-1'])
const storageKey = (agentId: string) => `marque:bench:v1:${agentId}`
const netName = (c: number) => (c === 56 ? 'BSC mainnet' : 'BSC testnet')

function Verdict({ pass }: { pass: boolean }) {
  return <span className={styles.verdict} data-pass={pass ? 'true' : 'false'}>{pass ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}{pass ? 'Passed' : 'Did not pass'}</span>
}

export function WorkspaceBench({ address, pick }: { address: string; pick?: string | null }) {
  const [selected, setSelected] = useState(pick ?? '')
  const owner = useInfiniteQuery({ queryKey: ['bench-owner', address], initialPageParam: null as string | null, retry: false, staleTime: 60_000,
    queryFn: async ({ pageParam, signal }) => {
      const r = await fetch(`/api/v1/phase2/owner/${address}${pageParam ? `?cursor=${pageParam}` : ''}`, { signal })
      if (!r.ok) throw new Error('unavailable')
      const page = await r.json() as BuilderPage
      if (page.owner?.toLowerCase() !== address.toLowerCase() || !Array.isArray(page.agents)) throw new Error('wrong_owner')
      return page
    }, getNextPageParam: page => page.page.nextCursor,
  })
  const agents = owner.data?.pages.flatMap(p => p.agents) ?? []
  const active = agents.find(a => a.agentKey === selected) ?? agents[0]
  useEffect(() => { setSelected(pick ?? '') }, [address, pick])
  return <div className={styles.bench}>
    <header className={styles.head}>
      <h2>Test your agent</h2>
      <p>Send it a practice task and see whether its answer matches the chain, field by field. Free and private: nothing here changes its public record.</p>
    </header>
    {owner.isPending ? <Skeleton h={60} /> : owner.isError ? <p className={styles.note}>Your agents could not be read just now. <button type="button" className={styles.textBtn} onClick={() => void owner.refetch()}>Try again</button></p> : !agents.length ? (
      <div className={styles.empty}>
        <p>No agent is registered to this wallet yet.</p>
        <div className={styles.row}><a className="btn btn--primary" href="/builders">Build an agent</a><a className="btn" href="/builders/test">Test any endpoint</a></div>
      </div>
    ) : <>
      {agents.length > 1 ? (
        <div className={styles.pickRow} role="radiogroup" aria-label="Agent to test">
          {agents.map(a => (
            <button key={a.agentKey} type="button" role="radio" aria-checked={active?.agentKey === a.agentKey} className={styles.pick} onClick={() => setSelected(a.agentKey)}>
              <AgentAvatar id={a.agentKey} imageUrl={a.imageUrl ?? null} size={24} /><span>{a.name}<small>{netName(a.chainId)}</small></span>
            </button>
          ))}
          {owner.hasNextPage ? <Button size="sm" loading={owner.isFetchingNextPage} onClick={() => void owner.fetchNextPage()}>More agents</Button> : null}
        </div>
      ) : active ? (
        <div className={styles.solo}><AgentAvatar id={active.agentKey} imageUrl={active.imageUrl ?? null} size={28} /><span><b>{active.name}</b><small>{netName(active.chainId)} · #{active.agentId}</small></span></div>
      ) : null}
      {active ? <AgentBench key={active.agentKey} agent={active} /> : null}
    </>}
  </div>
}

function AgentBench({ agent }: { agent: BuilderAgent }) {
  const [local, setLocal] = useState<LocalRun[]>([]), [saveError, setSaveError] = useState(false)
  const [canPersist, setCanPersist] = useState(false)
  const [all, setAll] = useState(false)
  const [tab, setTab] = useState<'public' | 'private'>('public')
  const [replay, setReplay] = useState<{ target: ReplayTarget; block: string | null; label: string } | null>(null)
  const q = useQuery({ queryKey: ['bench-history', agent.agentKey], staleTime: 60_000, retry: false, queryFn: async ({ signal }) => {
    const r = await fetch(`/api/v1/builders/bench/history?agentId=${encodeURIComponent(agent.agentKey)}`, { signal })
    if (!r.ok) throw new Error('unavailable')
    const h = History.parse(await r.json())
    if (h.agentId !== agent.agentKey) throw new Error('wrong_identity')
    return h
  } })
  useEffect(() => {
    try { const data = LocalRuns.parse(JSON.parse(localStorage.getItem(storageKey(agent.agentKey)) ?? '[]')); setLocal(data); setCanPersist(true) } catch { setSaveError(true); setCanPersist(false) }
  }, [agent.agentKey])
  const record = (result: BenchResult) => {
    const next = [{ receivedAt: new Date().toISOString(), result }, ...local]
    setLocal(next); setTab('private')
    try { if (!canPersist) throw new Error('existing_history_unreadable'); LocalRuns.parse(next); localStorage.setItem(storageKey(agent.agentKey), JSON.stringify(next)); setSaveError(false) } catch { setSaveError(true) }
  }
  const exportRuns = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ agentId: agent.agentKey, runs: local }, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `marque-bench-${agent.chainId}-${agent.agentId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const endpoint = agent.seller.services.find(s => s.declaredNow && s.kind === 'a2a') ?? agent.seller.services.find(s => s.declaredNow && s.kind === 'mcp')
  const misses = q.data?.misses ?? []
  return <>
    {q.isPending ? <Skeleton h={160} /> : q.isError ? <p className={styles.note}>This agent&apos;s test history could not be read just now. <button type="button" className={styles.textBtn} onClick={() => void q.refetch()}>Try again</button> or use the <a href="/builders/test">standalone test page</a>.</p> : q.data ? <>
      <section className={styles.card} aria-label="Run a test">
        {q.data.standard && standards.has(q.data.standard)
          ? <TestForm key={`${agent.agentKey}:${q.data.standard}`} initialEndpoint={endpoint?.endpoint ?? ''} initialKind={endpoint?.kind === 'mcp' ? 'mcp' : 'a2a'} initialTestId={q.data.standard} onResult={record} showReference={false} />
          : <p className={styles.note}>There is no Marque test for this agent&apos;s kind of work yet, so nothing is run in its place. <a href={`/agents/${agent.chainId}/${agent.agentId}/evidence`}>See its existing evidence</a>.</p>}
      </section>

      {misses.length ? (
        <section className={styles.card} data-tone="warn" aria-labelledby="miss-h">
          <h3 id="miss-h">Paid answers that did not match the chain</h3>
          <p className={styles.note}>A buyer paid for these. Try your fix against the exact same case.</p>
          <ul className={styles.list}>
            {misses.map(m => (
              <li key={`${m.chainId}:${m.jobId}`}>
                <div className={styles.listMain}>
                  <a href={`/jobs/${m.chainId}/${m.jobId}`}>Job {m.jobId}</a><span className={styles.muted}>{netName(m.chainId)}</span>
                  <ul className={styles.diffs}>{m.checks.filter(c => c.state === 'differs').map(c => <li key={c.key}><b>{c.label}</b>: your agent said {c.agent ?? 'nothing'}, the chain said {c.marque ?? 'not available'}</li>)}</ul>
                </div>
                {m.block ? <Button size="sm" onClick={() => setReplay({ target: { chainId: m.chainId, jobId: m.jobId }, block: m.block, label: `job ${m.jobId}` })}>Try a fix</Button> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.card} aria-labelledby="res-h">
        <div className={styles.cardHead}>
          <h3 id="res-h">Results</h3>
          <div className={styles.seg} role="tablist" aria-label="Which results">
            <button type="button" role="tab" aria-selected={tab === 'public'} onClick={() => setTab('public')}>Public <span>{q.data.tests.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === 'private'} onClick={() => setTab('private')}>Your tries <span>{local.length}</span></button>
          </div>
        </div>
        {tab === 'public' ? <>
          <p className={styles.note}>What buyers see on the agent&apos;s page{misses.length === 0 && (agent.seller.jobs?.completed ?? 0) > 0 ? '. Every paid answer so far matched the chain' : ''}.</p>
          {q.data.tests.length ? <ul className={styles.list}>{q.data.tests.map(t => (
            <li key={t.id}>
              <div className={styles.listMain}><Verdict pass={t.pass} /><span>{testName(t.testId)}</span><span className={styles.muted} title={t.block ? `Block ${t.block}` : undefined}>{when(t.at)}</span></div>
              <div className={styles.listActs}>
                {t.caseId && !t.pass ? <Button size="sm" onClick={() => setReplay({ target: { caseId: t.caseId! }, block: t.block, label: `${testName(t.testId)}, ${when(t.at)}` })}>Try a fix</Button> : null}
                <a className={styles.textLink} href={`/api/v1/conformance/${t.id}`}>Raw record</a>
              </div>
            </li>
          ))}</ul> : <p className={styles.empty}>No public result yet. Buyers see one after Marque tests the agent.</p>}
        </> : <>
          <p className={styles.note}>Saved only in this browser. Nobody else sees them.</p>
          {saveError ? <p className={styles.note} role="status">This browser could not save every try. Nothing already saved was removed; export what you see to keep it.</p> : null}
          {local.length ? <>
            <ul className={styles.list}>{(all ? local : local.slice(0, 5)).map((run, i) => (
              <li key={`${run.receivedAt}:${i}`}><div className={styles.listMain}><Verdict pass={run.result.pass} /><span>{testName(run.result.testId)}</span><span className={styles.muted} title={`Block ${run.result.blockNumber}`}>{when(run.receivedAt)}</span></div></li>
            ))}</ul>
            <div className={styles.row}>
              {local.length > 5 ? <button type="button" className={styles.textBtn} onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${local.length}`}</button> : null}
              <button type="button" className={styles.textBtn} onClick={exportRuns}><Download aria-hidden="true" />Export</button>
            </div>
          </> : <p className={styles.empty}>No tries yet. Run a test above; it appears here.</p>}
        </>}
      </section>
    </> : null}
    {replay ? <AnswerReplay key={JSON.stringify(replay.target)} target={replay.target} block={replay.block} label={replay.label} onClose={() => setReplay(null)} /> : null}
  </>
}
