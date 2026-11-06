'use client'
import { useEffect, useState } from 'react'
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
  return <section aria-label="Answers with recorded checks">
    <h3 className={styles.dayHead}>Answers you can recheck</h3>
    {q.isPending ? <Skeleton h={36} /> : q.isError ? <p className={styles.fine}>The recorded-answer index is unavailable. <button type="button" className={styles.textBtn} onClick={() => void q.refetch()}>Read again</button></p> : d ? <>
      <p className={styles.fine}>{d.total} delivered answers have checks pinned to a block. Read {d.observedAt.replace('T', ' ').slice(0, 19)} UTC. Some categories or fields may have no live comparison.</p>
      {d.total ? <button type="button" className={styles.textBtn} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Hide answers' : 'Choose an answer to recheck'}</button> : <p className={styles.fine}>Your original job history remains in Jobs. An answer needs recorded checks and a block before it appears here.</p>}
      {expanded ? <>
        <p className={styles.fine}>Showing {compact ? Math.min(3, d.rows.length) : d.rows.length} of {d.total} recorded answers, with each job&apos;s own network. Each button reads only that answer when you choose it.</p>
        {(compact ? d.rows.slice(0, 3) : d.rows).map(row => <div key={`${row.chainId}:${row.jobId}`}><a href={`/jobs/${row.chainId}/${row.jobId}`}>Open job {row.jobId} · {row.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'}</a><Recheck chainId={row.chainId} jobId={row.jobId} answerBlock={row.answerBlock} answerAt={row.answeredAt} /></div>)}
        {compact && d.total > 3 ? <a href={`?addr=${address}&view=jobs`}>All answers in Jobs</a> : !compact ? <div>{cursor !== '0' ? <Button size="sm" onClick={() => setCursor('0')}>First page</Button> : null}{d.nextCursor ? <Button size="sm" onClick={() => setCursor(d.nextCursor!)}>Next answers</Button> : null}</div> : null}
      </> : null}
    </> : null}
  </section>
}
