'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { RecheckIndex } from '../../lib/recheck-schema'
import { Recheck } from '../_components/Recheck'
import { Button, Skeleton } from '../_components/ui'
import styles from './workspace.module.css'

export function RecheckList({ address, compact = false }: { address: string; compact?: boolean }) {
  const [cursor, setCursor] = useState('0')
  const q = useQuery({ queryKey: ['recheck-index', address.toLowerCase(), cursor], staleTime: 60_000, retry: false, queryFn: async ({ signal }) => {
    const r = await fetch(`/api/v1/wallet/${address}/recheckable?cursor=${cursor}`, { signal })
    if (!r.ok) throw new Error('unavailable')
    const data = RecheckIndex.parse(await r.json())
    if (data.address.toLowerCase() !== address.toLowerCase()) throw new Error('wrong_address')
    return data
  } })
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { setCursor('0'); setExpanded(false) }, [address])
  const d = q.data
  return <section className={styles.recheckPanel} aria-label="Answers with recorded checks">
    <h3 className={styles.dayHead}>Check an answer again</h3>
    {q.isPending ? <Skeleton h={36} /> : q.isError ? <p className={styles.fine}>Your answered jobs could not be read just now. <button type="button" className={styles.textBtn} onClick={() => void q.refetch()}>Try again</button></p> : d ? <>
      <p className={styles.fine} title={`Read ${d.observedAt.replace('T', ' ').slice(0, 19)} UTC`}>{d.total ? `${d.total} answer${d.total === 1 ? '' : 's'} you paid for can be checked against the chain again, as it was when the agent answered.` : 'Answers you pay for appear here, so you can check them against the chain again.'}</p>
      {d.total ? <button type="button" className={`btn btn--primary ${styles.recheckToggle}`} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><RotateCcw aria-hidden="true" />{expanded ? 'Hide answers' : 'Pick an answer to check'}<ChevronDown aria-hidden="true" /></button> : null}
      {expanded ? <div className={styles.recheckAnswers}>
        <p className={styles.fine}>Showing {compact ? Math.min(3, d.rows.length) : d.rows.length} of {d.total}.</p>
        {(compact ? d.rows.slice(0, 3) : d.rows).map(row => <div className={styles.recheckAnswer} key={`${row.chainId}:${row.jobId}`}><a href={`/jobs/${row.chainId}/${row.jobId}`}>Job {row.jobId} · {row.chainId === 56 ? 'mainnet' : 'testnet'}</a><Recheck chainId={row.chainId} jobId={row.jobId} answerBlock={row.answerBlock} answerAt={row.answeredAt} /></div>)}
        {compact && d.total > 3 ? <a href={`?addr=${address}&view=jobs`}>All answers in Jobs</a> : !compact ? <div>{cursor !== '0' ? <Button size="sm" onClick={() => setCursor('0')}>First page</Button> : null}{d.nextCursor ? <Button size="sm" onClick={() => setCursor(d.nextCursor!)}>Next answers</Button> : null}</div> : null}
      </div> : null}
    </> : null}
  </section>
}
