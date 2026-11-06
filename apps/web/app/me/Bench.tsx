'use client'
import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { BuilderAgent, BuilderPage } from '../../lib/builder-workspace'
import { TestForm, type BenchResult } from '../builders/test/TestForm'
import { AnswerReplay } from '../builders/AnswerReplay'
import type { ReplayTarget } from '../../lib/bench-replay'
import { Button, Skeleton } from '../_components/ui'
import styles from '../builders/bench.module.css'

const Check = z.object({ key: z.string(), label: z.string(), state: z.string(), agent: z.string().nullable(), marque: z.string().nullable(), how: z.string(), detail: z.string().nullable() })
const History = z.object({ agentId: z.string(), standard: z.string().nullable(), observedAt: z.string().datetime(),
  tests: z.array(z.object({ id: z.number(), testId: z.string(), caseId: z.string().nullable(), pass: z.boolean(), at: z.string().nullable(), block: z.string().nullable(), failedFields: z.unknown() })).max(20),
  misses: z.array(z.object({ chainId: z.union([z.literal(56), z.literal(97)]), jobId: z.string(), block: z.string().nullable(), checks: z.array(Check) })).max(20),
})
type LocalRun = { receivedAt: string; result: BenchResult }
const LocalRuns = z.array(z.object({ receivedAt: z.string().datetime(), result: z.object({ testId: z.string(), pass: z.boolean(), error: z.string().nullable(), latencyMs: z.number().finite(), caseId: z.string(), blockNumber: z.string(), note: z.string(), diffs: z.array(z.object({ field: z.string(), pass: z.boolean(), expected: z.string(), actual: z.string(), tolerance: z.string(), detail: z.string().optional() })) }) }))
const standards = new Set(['MCS-HF-1', 'MCS-REB-1', 'MCS-GRID-1', 'MCS-YIELD-1', 'MCS-RYIELD-1'])
const storageKey = (agentId: string) => `marque:bench:v1:${agentId}`

export function WorkspaceBench({ address }: { address: string }) {
  const [selected, setSelected] = useState('')
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
  useEffect(() => { setSelected('') }, [address])
  return <div className={styles.bench}>
    <h3>Bench</h3><p>Check a fix without a paid job. Fresh endpoint tests require permission; recorded answer replays compare supplied JSON at the original block. Neither changes a published result.</p>
    {owner.isPending ? <Skeleton h={60} /> : owner.isError ? <p>The owned identities could not be read. <button type="button" onClick={() => void owner.refetch()}>Read again</button></p> : !agents.length ? <p>No owned identity is indexed for this wallet. <a href="/builders/test">Open the standalone Bench for an endpoint you control</a>, or <a href="/builders">build or bring an agent</a>.</p> : <>
      <label>Agent<select value={active?.agentKey ?? ''} onChange={e => setSelected(e.target.value)}>{agents.map(a => <option value={a.agentKey} key={a.agentKey}>{a.name} · {a.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'} · #{a.agentId}</option>)}</select></label>
      {owner.hasNextPage ? <Button size="sm" loading={owner.isFetchingNextPage} onClick={() => void owner.fetchNextPage()}>Load more agents</Button> : null}
      {active ? <AgentBench key={active.agentKey} agent={active} /> : null}
    </>}
  </div>
}

function AgentBench({ agent }: { agent: BuilderAgent }) {
  const [local, setLocal] = useState<LocalRun[]>([]), [saveError, setSaveError] = useState(false)
  const [canPersist, setCanPersist] = useState(false)
  const [all, setAll] = useState(false)
  const [replay, setReplay] = useState<{ target: ReplayTarget; block: string | null } | null>(null)
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
    setLocal(next)
    try { if (!canPersist) throw new Error('existing_history_unreadable'); LocalRuns.parse(next); localStorage.setItem(storageKey(agent.agentKey), JSON.stringify(next)); setSaveError(false) } catch { setSaveError(true) }
  }
  const exportRuns = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ agentId: agent.agentKey, runs: local }, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `marque-bench-${agent.chainId}-${agent.agentId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const endpoint = agent.seller.services.find(s => s.declaredNow && s.kind === 'a2a') ?? agent.seller.services.find(s => s.declaredNow && s.kind === 'mcp')
  return <>
    {q.isPending ? <Skeleton h={100} /> : q.isError ? <p>The saved test history could not be read. <button type="button" onClick={() => void q.refetch()}>Read again</button> · <a href="/builders/test">Standalone Bench</a></p> : q.data ? <>
      {q.data.standard && standards.has(q.data.standard) ? <TestForm key={`${agent.agentKey}:${q.data.standard}`} initialEndpoint={endpoint?.endpoint ?? ''} initialKind={endpoint?.kind === 'mcp' ? 'mcp' : 'a2a'} initialTestId={q.data.standard} onResult={record} /> : <p>This identity has no supported published Bench standard. <a href={`/agents/${agent.chainId}/${agent.agentId}/evidence`}>Read its existing evidence</a>. A category test is not substituted for a different capability.</p>}
      <h4>Published test history</h4><p>Latest recorded results, up to 20, read {q.data.observedAt.replace('T', ' ').slice(0, 19)} UTC. These published records are separate from private Bench attempts.</p>
      {q.data.tests.length ? <ul className={styles.history}>{q.data.tests.map(t => <li key={t.id}><a href={`/api/v1/conformance/${t.id}`}>{t.testId} · {t.pass ? 'Passed' : 'Did not pass'}</a> · block {t.block ?? 'not recorded'} · {t.at?.replace('T', ' ').slice(0, 16) ?? 'Time not recorded'}{t.caseId ? <> · <button type="button" onClick={() => setReplay({ target: { caseId: t.caseId! }, block: t.block })}>Replay supplied answer</button></> : null}</li>)}</ul> : <p>No published test result is indexed for this identity.</p>}
      <h4>Replay a delivery miss</h4><p>Latest exact-identity jobs with a disagreeing chain check, up to 20. Original field values and blocks are preserved.</p>
      {q.data.misses.length ? <div>{q.data.misses.map(m => <article key={`${m.chainId}:${m.jobId}`}><p><a href={`/jobs/${m.chainId}/${m.jobId}`}>Job {m.jobId} · {m.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'}</a> · block {m.block ?? 'not recorded'}</p><dl className={styles.diffs}>{m.checks.filter(c => c.state === 'differs').map(c => <div key={c.key}><dt>{c.label}</dt><dd>Agent: {c.agent ?? 'not given'}</dd><dd>Chain at that block: {c.marque ?? 'not available'}</dd></div>)}</dl>{m.block ? <Button size="sm" onClick={() => setReplay({ target: { chainId: m.chainId, jobId: m.jobId }, block: m.block })}>Replay this case on the Bench</Button> : null}</article>)}</div> : <p>No paid-answer chain disagreement is recorded in this exact-identity history.</p>}
    </> : null}
    {replay ? <AnswerReplay key={JSON.stringify(replay.target)} target={replay.target} block={replay.block} /> : null}
    <h4>Bench runs saved on this device</h4><p>Private attempts started here are saved only in this browser. The server does not publish these outcomes against your identity. No older private attempts are invented.</p>
    {saveError ? <p role="status">This browser could not save or read the complete local history. Existing saved entries were not cleared. Export the visible results.</p> : null}
    {local.length ? <><ul className={styles.history}>{(all ? local : local.slice(0, 5)).map((run, i) => <li key={`${run.receivedAt}:${i}`}>{run.result.testId} · {run.result.pass ? 'Passed' : 'Did not pass'} · block {run.result.blockNumber} · received {run.receivedAt.replace('T', ' ').slice(0, 19)} UTC</li>)}</ul>{local.length > 5 ? <button type="button" onClick={() => setAll(v => !v)}>{all ? 'Show fewer runs' : `Show all ${local.length} saved runs`}</button> : null}<Button size="sm" onClick={exportRuns}>Export saved results</Button></> : <p>No Bench run is saved on this device for this identity.</p>}
  </>
}
