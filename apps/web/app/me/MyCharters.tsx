'use client'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { HealthRule } from '../charters/_components/HealthRule'
import { Skeleton } from '../_components/ui'
import styles from './mycharters.module.css'

/**
 * My Marque's Charters tab (03_EXPERIENCE section 2): every charter this address owns, newest first, each as a
 * row with its mini Health Rule, budget left and status, plus a banner when one needs its owner. Read from the
 * guards API, which answers only once Charters is public or previewed; until then the tab does not exist.
 */
type Guard = {
  chainId: 56 | 97; address: string; symbol: string; decimals: number; trigger: string; target: string; budget: string; spent: string
  acts: number; expiresAt: string; endedAt: string | null; status: 'armed' | 'ended' | 'expired'
  lastSample: { state: number; health: string | null; readAt: string } | null
}
const h = (wad: string | null | undefined) => (wad ? Number(BigInt(wad) / 10n ** 14n) / 10_000 : null)
const hund = (wad: string) => Math.round(Number(BigInt(wad) / 10n ** 16n))
const units = (v: bigint, d: number) => (Number(v / 10n ** BigInt(Math.max(0, d - 2))) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Is Charters reachable for this browser? One cheap read, shared by the tab list and Today. */
export function useChartersOn() {
  return useQuery({ queryKey: ['charters-on'], staleTime: 10 * 60_000, retry: false,
    queryFn: async () => (await fetch('/api/v1/guards/stats', { cache: 'no-store' })).ok })
}

export function useMyGuards(address: string, enabled: boolean) {
  return useQuery({ queryKey: ['my-guards', address.toLowerCase()], enabled, staleTime: 30_000, retry: false,
    queryFn: async () => {
      const r = await fetch(`/api/v1/guards?owner=${address}&state=all&limit=50`, { cache: 'no-store' })
      if (!r.ok) throw new Error('unavailable')
      return ((await r.json()) as { guards: Guard[] }).guards
    } })
}

/** What needs the owner, in section 5's words: nothing it can use, a loan it cannot save, or ending within 3 days. */
export function attentionOf(g: Guard): string | null {
  if (g.status !== 'armed') return null
  const left = BigInt(g.budget) - BigInt(g.spent)
  if (left <= 0n) return `Its whole budget is used. Grant a new charter to keep guarding this ${g.symbol} loan.`
  if (g.lastSample?.state === 5) return 'Health is under the trigger, but the guard has nothing it can use: check your wallet balance and allowance.'
  if (g.lastSample?.state === 6) return 'Health is under 1.00 and the budget cannot lift it back. Repay directly on Venus, or add collateral.'
  const msLeft = Date.parse(g.expiresAt) - Date.now()
  if (msLeft < 3 * 86_400_000) return `It ends ${day(g.expiresAt)}. Grant a new one to keep guarding.`
  return null
}

function Row({ g }: { g: Guard }) {
  const left = BigInt(g.budget) - BigInt(g.spent)
  const word = g.status === 'ended' ? 'Ended' : g.status === 'expired' ? 'Expired' : attentionOf(g) ? 'Needs you' : g.lastSample?.state === 1 ? 'Acting' : 'Armed'
  const tone = word === 'Armed' ? 'moss' : word === 'Needs you' || word === 'Acting' ? 'amber' : 'ink'
  return (
    <li>
      <a className={styles.row} href={`/charters/${g.chainId}/${g.address}`}>
        <span className={styles.title}><b>{g.symbol} loan guard</b><small>Acts below {(hund(g.trigger) / 100).toFixed(2)}, lifts to {(hund(g.target) / 100).toFixed(2)}, on Venus · {g.chainId === 56 ? 'mainnet' : 'testnet'}</small></span>
        <span className={styles.rule}><HealthRule variant="mini" now={h(g.lastSample?.health)} trigger={hund(g.trigger)} target={hund(g.target)} label={`Health ${h(g.lastSample?.health) ?? 'not read'}, trigger ${hund(g.trigger) / 100}, target ${hund(g.target) / 100}`} /></span>
        <span className={styles.left}>{g.status === 'armed' ? `${units(left > 0n ? left : 0n, g.decimals)} of ${units(BigInt(g.budget), g.decimals)} left` : g.acts ? `acted ${g.acts} time${g.acts === 1 ? '' : 's'}` : 'never needed to act'}</span>
        <span className={styles.status} data-tone={tone}>{word}</span>
        <ChevronRight aria-hidden="true" className={styles.chev} />
      </a>
    </li>
  )
}

export function MyCharters({ address }: { address: string }) {
  const q = useMyGuards(address, true)
  if (q.isPending) return <Skeleton h={120} />
  if (q.isError) return <p className={styles.note}>Charters could not be read just now. <button type="button" className={styles.link} onClick={() => void q.refetch()}>Try again</button></p>
  const guards = q.data ?? []
  const needs = guards.filter((g) => attentionOf(g))
  return (
    <div className={styles.wrap}>
      {needs.length ? (
        <div className={styles.banner} role="status">
          <p><b>{needs.length === 1 ? 'One charter needs you.' : `${needs.length} charters need you.`}</b> {attentionOf(needs[0]!)}</p>
          <a className="btn btn--sm" href={`/charters/${needs[0]!.chainId}/${needs[0]!.address}`}>Review</a>
        </div>
      ) : null}
      {guards.length ? <ul className={styles.list}>{guards.map((g) => <Row key={`${g.chainId}:${g.address}`} g={g} />)}</ul> : (
        <div className={styles.empty}>
          <p>No charters yet. A Loan Guard repays your own Venus loan from your wallet if its health falls below a line you draw.</p>
          <a className="btn btn--primary" href={`/charters/new?account=${address}`}>Guard a loan</a>
        </div>
      )}
      {guards.length && !guards.some((g) => g.status === 'armed') ? (
        <div className={styles.suggest}><p>None of your charters is armed now.</p><a className="btn btn--sm" href={`/charters/new?account=${address}`}>Guard a loan</a></div>
      ) : null}
    </div>
  )
}

/** Today's charter lines: the same attention items, one line each, linking to the charter. */
export function CharterToday({ address }: { address: string }) {
  const on = useChartersOn()
  const q = useMyGuards(address, on.data === true)
  const needs = (q.data ?? []).filter((g) => attentionOf(g))
  if (!needs.length) return null
  return (
    <div className={styles.banner} role="status">
      <p><b>Charters</b> {needs.length === 1 ? attentionOf(needs[0]!) : `${needs.length} charters need you.`}</p>
      <a className="btn btn--sm" href={`/charters/${needs[0]!.chainId}/${needs[0]!.address}`}>Review</a>
    </div>
  )
}
