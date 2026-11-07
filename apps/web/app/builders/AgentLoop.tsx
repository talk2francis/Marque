'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ProvenanceChip } from '@marque/ui'
import { BuilderLoop, currentLoopNodes } from '../../lib/builder-loop'
import { Skeleton } from '../_components/ui'
import styles from './agent-loop.module.css'

export function AgentLoop({ agentId }: { agentId: string }) {
  const marker = useRef<HTMLElement>(null), [visible, setVisible] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    if (!('IntersectionObserver' in window)) { setVisible(true); return () => clearInterval(timer) }
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
    if (marker.current) observer.observe(marker.current)
    return () => { observer.disconnect(); clearInterval(timer) }
  }, [])
  const q = useQuery({ queryKey: ['builder-loop', agentId], enabled: visible, staleTime: 30_000, retry: false, refetchOnWindowFocus: false, queryFn: async ({ signal }) => {
    const r = await fetch(`/api/v1/builders/lifecycle?agentId=${encodeURIComponent(agentId)}`, { signal })
    if (!r.ok) throw new Error('unavailable')
    const data = BuilderLoop.parse(await r.json())
    if (data.agentId !== agentId) throw new Error('wrong_identity')
    return data
  } })
  if (q.isPending) return <section ref={marker}><Skeleton h={90} /></section>
  if (q.isError || !q.data) return <p className={styles.note}>The delivery record is unavailable. <button className={styles.retry} type="button" onClick={() => void q.refetch()}>Read again</button></p>
  const d = { ...q.data, nodes: now === null ? q.data.nodes : currentLoopNodes(q.data.nodes, now) }
  const next = d.nodes.find(n => n.state !== 'observed')
  return <section className={styles.loop} aria-label="Agent delivery record">
    <details className={styles.disclosure}>
    <summary><span><b>Delivery record</b><small>Connection, price and completed work</small></span><ChevronDown aria-hidden="true" /></summary>
    <div className={styles.body}>
    <p className={styles.note}><ProvenanceChip provenance="MEASURED" /> {d.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'} · Read {d.observedAt.replace('T', ' ').slice(0, 19)} UTC.</p>
    <ol className={styles.steps}>{d.nodes.map(n => <li key={n.id} data-state={n.state}>
      <a href={n.href}><span className={styles.dot} aria-hidden="true" /><strong>{n.label}</strong></a>
      <span>{n.state === 'observed' ? 'Recorded' : n.state === 'expired' ? 'Price expired' : n.state === 'unavailable' ? 'Check needed' : 'Not recorded'}</span>
      {n.at ? <time dateTime={n.at}>{n.at.replace('T', ' ').slice(0, 16)} UTC</time> : <span>Time not recorded</span>}
      {n.expiresAt ? <span>Expires {n.expiresAt.replace('T', ' ').slice(11, 16)} UTC</span> : null}
    </li>)}</ol>
    {next ? <p className={styles.next}><b>{next.label}:</b> {next.detail} <a href={next.href}>Open the evidence</a></p> : <p className={styles.next}>All six milestones have recorded evidence. Keep the endpoint answering and the next buyer&apos;s delivery readable.</p>}
    <p className={styles.note}>Recorded events, separate from campaign qualification. Checked follows the existing marketplace standing; a price sample can expire. Payment release and a submitted answer are separate events.</p>
    </div>
    </details>
  </section>
}
