'use client'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { MeasureRule, ProvenanceChip } from '@marque/ui'
import { watched, WATCH_EVENT } from '../../lib/local-watch'
import { Button, Skeleton } from '../_components/ui'
import styles from './positions.module.css'

const Finite = z.number().finite()
const Position = z.object({ tokenId: z.string(), pair: z.string(), inRange: z.boolean(), priceLower: Finite, priceUpper: Finite, priceCurrent: Finite, priceUnit: z.string(), pctToLower: Finite, pctToUpper: Finite })
const Snapshot = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), chainId: z.literal(56), blockNumber: z.string().regex(/^\d+$/), readAt: z.string().datetime(),
  venus: z.object({ ok: z.boolean(), hasPosition: z.boolean(), healthFactor: Finite.nullable(), totalBorrowedUsd: Finite }),
  pancakeV3: z.object({ ok: z.boolean(), positions: z.array(Position).max(100) }),
})
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`

function PositionRead({ address, line, own }: { address: string; line: number | null; own: boolean }) {
  const [open, setOpen] = useState(own)
  const q = useQuery({ queryKey: ['workspace-position', address.toLowerCase()], enabled: open, staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/v1/positions/${address}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]) })
      if (!r.ok) throw new Error('unavailable')
      const data = Snapshot.parse(await r.json())
      if (data.address.toLowerCase() !== address.toLowerCase()) throw new Error('wrong_address')
      return data
    },
  })
  const s = q.data
  const hf = s?.venus.ok ? s.venus.healthFactor : null
  return <section className={styles.account} aria-label={`${own ? 'Wallet' : 'Watched'} positions ${address}`}>
    <div className={styles.head}>
      <h3>{own ? 'This wallet' : 'Watched address'} <span title={address}>{short(address)}</span></h3>
      <span className={styles.network}>BSC mainnet · 56</span>
      {!own ? <button type="button" className={styles.link} aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Hide positions' : 'Read positions'}</button> : null}
    </div>
    {open ? <>
      {q.isPending ? <Skeleton h={70} /> : q.isError ? <p role="status">Positions could not be read. <Button size="sm" onClick={() => void q.refetch()}>Read again</Button></p> : s ? <>
        <p className={styles.read}><ProvenanceChip provenance="ONCHAIN" /> Block {s.blockNumber} · <time dateTime={s.readAt}>{s.readAt.replace('T', ' ').slice(0, 19)} UTC</time></p>
        {!s.venus.ok ? <p>Venus could not be read. No health factor is assumed.</p> : s.venus.hasPosition && hf !== null ? <article className={styles.position}>
          <h4>Venus health factor <strong>{hf.toFixed(3)}</strong></h4>
          <p>{hf < 1 ? 'Below the liquidation line.' : 'Above the liquidation line.'}{line !== null ? ` Your alert line: ${line}.` : ''}</p>
          <MeasureRule value={hf} lower={0} upper={Math.max(3, hf)} threshold={line ?? 1} thresholdLabel={line !== null ? `Your line ${line}` : 'Liquidation 1'} valueLabel={hf.toFixed(3)} state={hf < 1 ? 'breach' : line !== null && hf < line ? 'watch' : 'holds'} label={`Venus health factor ${hf}, liquidation line 1${line !== null ? `, your alert line ${line}` : ''}`} animate={false} />
          <a className="btn btn--sm" href={`/tender?category=health_factor&account=${address}`}>Ask agents about this</a>
        </article> : <p>No Venus borrowing position with a health factor was returned for this wallet.</p>}
        {!s.pancakeV3.ok ? <p>PancakeSwap V3 could not be read. No empty position list is assumed.</p> : s.pancakeV3.positions.map(p => <article key={p.tokenId} className={styles.position}>
          <h4>PancakeSwap V3 · {p.pair} · #{p.tokenId}</h4>
          <p>{p.inRange ? 'Inside the range' : 'Outside the range'}. Price {p.priceCurrent.toLocaleString('en-US', { maximumSignificantDigits: 6 })} {p.priceUnit}.</p>
          <MeasureRule value={p.priceCurrent} lower={p.priceLower} upper={p.priceUpper} valueLabel={p.priceCurrent.toLocaleString('en-US', { maximumSignificantDigits: 5 })} lowerLabel={p.priceLower.toLocaleString('en-US', { maximumSignificantDigits: 5 })} upperLabel={p.priceUpper.toLocaleString('en-US', { maximumSignificantDigits: 5 })} state={p.inRange ? 'holds' : 'watch'} label={`${p.pair}, current price ${p.priceCurrent}, range ${p.priceLower} to ${p.priceUpper}`} animate={false} />
          <a className="btn btn--sm" href={`/tender?category=rebalancing&owner=${address}&position=${p.tokenId}`}>Ask agents about this</a>
        </article>)}
        {s.venus.ok && s.pancakeV3.ok && !s.venus.hasPosition && !s.pancakeV3.positions.length ? <p>No Venus loan or active PancakeSwap V3 range was returned. Paste any address to watch it below, or <a href="/positions?addr=0x2e010AaDFdFEbC2AdFCAFA5F83e9687ffA47C573">read the demo wallet</a>.</p> : null}
      </> : null}
    </> : null}
  </section>
}

export function WorkspacePositions({ address }: { address: string }) {
  const [list, setList] = useState<ReturnType<typeof watched>>([])
  useEffect(() => { const load = () => setList(watched()); load(); addEventListener(WATCH_EVENT, load); addEventListener('storage', load); return () => { removeEventListener(WATCH_EVENT, load); removeEventListener('storage', load) } }, [])
  return <div className={styles.positions}>
    <p>Live borrowing and liquidity positions. Watched addresses are saved on this device. Open one to read it without starting reads for every saved wallet.</p>
    <PositionRead key={address} address={address} line={list.find(w => w.address.toLowerCase() === address.toLowerCase())?.hfBelow ?? null} own />
    {list.filter(w => w.address.toLowerCase() !== address.toLowerCase()).map(w => <PositionRead key={w.address} address={w.address} line={w.hfBelow} own={false} />)}
  </div>
}
