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
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/v1/guards/stats', { cache: 'no-store', signal })
      // Finish the response even though this read only needs its status; an unread body can leave the request open.
      await response.arrayBuffer()
      return response.ok
    } })
}

type V2 = {
  chainId: 56 | 97; address: string; kind: 'loan' | 'yield' | 'grid' | 'range'; kindName: string; params: { p?: Record<string, string> }; totals: Record<string, string | number | boolean>
  actions: number; expiresAt: string; status: 'armed' | 'ended' | 'expired'; fixture: boolean; pool: { baseSymbol: string; quoteSymbol: string } | null
  lastSample: { state: number; stateName: string; readAt: string } | null
}
type Claims = { chainId: 56 | 97; tokens: Array<{ token: string; symbol: string; balance: string; needsTotal: string; short: boolean; claims: Array<{ charter: string; kind: string; need: string; needIs: string }> }>; needsYou: number }

export function useMyGuards(address: string, enabled: boolean) {
  return useQuery({ queryKey: ['my-guards', address.toLowerCase()], enabled, staleTime: 30_000, retry: false,
    queryFn: async () => {
      const r = await fetch(`/api/v1/guards?owner=${address}&state=all&limit=50`, { cache: 'no-store' })
      if (!r.ok) throw new Error('unavailable')
      return ((await r.json()) as { guards: Guard[] }).guards
    } })
}
export function useMyCharters(address: string, enabled: boolean) {
  return useQuery({ queryKey: ['my-charters-v2', address.toLowerCase()], enabled, staleTime: 30_000, retry: false,
    queryFn: async () => {
      const r = await fetch(`/api/v1/guards?owner=${address}&state=all&limit=50`, { cache: 'no-store' })
      if (!r.ok) throw new Error('unavailable')
      return ((await r.json()) as { charters?: V2[] }).charters ?? []
    } })
}
/** Claims per token on each chain where this address has an armed charter (AGENTS.md C5). */
export function useClaims(address: string, chains: Array<56 | 97>) {
  return useQuery({ queryKey: ['my-claims', address.toLowerCase(), chains.join()], enabled: chains.length > 0, staleTime: 60_000, retry: false,
    queryFn: async () => Promise.all(chains.map(async (c) => {
      const r = await fetch(`/api/v1/guards/claims?chainId=${c}&owner=${address}`, { cache: 'no-store' })
      return r.ok ? ((await r.json()) as Claims) : null
    })).then((x) => x.filter((y): y is Claims => y !== null)) })
}
const v2Line = (c: V2) => {
  const p = c.params.p ?? {}
  if (c.kind === 'loan') return `Acts below ${(Number(BigInt(p['trigger'] ?? '0') / 10n ** 16n) / 100).toFixed(2)}, lifts to ${(Number(BigInt(p['target'] ?? '0') / 10n ** 16n) / 100).toFixed(2)}`
  if (c.kind === 'yield') return 'Keeps your wallet inside its band, the rest in Venus'
  if (c.kind === 'grid') return `${p['slots']} levels on ${c.pool ? `${c.pool.baseSymbol}/${c.pool.quoteSymbol}` : 'PancakeSwap'}, ${c.totals['sells'] ?? 0} round trips`
  return `${c.totals['rebalances'] ?? 0} of ${p['maxRebalances']} moves used${c.totals['returned'] ? ', position returned' : ''}`
}
function V2Row({ c }: { c: V2 }) {
  const acting = c.lastSample ? ['would_act', 'would_supply', 'would_withdraw', 'would_buy', 'would_sell', 'would_move'].includes(c.lastSample.stateName) : false
  const stuck = c.lastSample ? ['no_funds', 'limit_reached', 'cap_reached', 'below_minimum', 'nothing_held'].includes(c.lastSample.stateName) : false
  const word = c.status === 'ended' ? 'Ended' : c.status === 'expired' ? 'Expired' : stuck ? 'Needs you' : acting ? 'Acting' : 'Armed'
  const tone = word === 'Armed' ? 'moss' : word === 'Needs you' || word === 'Acting' ? 'amber' : 'ink'
  return (
    <li>
      <a className={styles.row} href={`/charters/${c.chainId}/${c.address}`}>
        <span className={styles.title}><b>{c.kindName}</b><small>{v2Line(c)} · {c.chainId === 56 ? 'mainnet' : 'testnet'}{c.fixture ? ' fixture pool' : ''}</small></span>
        <span className={styles.left}>{c.actions ? `acted ${c.actions} time${c.actions === 1 ? '' : 's'}` : 'no actions yet'}</span>
        <span className={styles.status} data-tone={tone}>{word}</span>
        <ChevronRight aria-hidden="true" className={styles.chev} />
      </a>
    </li>
  )
}
function ClaimsPanel({ claims }: { claims: Claims[] }) {
  const rows = claims.flatMap((c) => c.tokens.filter((t) => t.claims.length > 1 || t.short).map((t) => ({ ...t, chainId: c.chainId })))
  if (!rows.length) return null
  return (
    <section className={styles.suggest} aria-labelledby="claims-h">
      <div>
        <p id="claims-h"><b>Claims on your wallet</b> An allowance is a ceiling, not a reservation: charters drawing the same token share one balance.</p>
        <ul className={styles.list}>
          {rows.map((t) => (
            <li key={`${t.chainId}:${t.token}`}><span className={styles.title}><b>{t.symbol}</b><small>{t.claims.length} charter{t.claims.length === 1 ? '' : 's'} may draw it · {t.chainId === 56 ? 'mainnet' : 'testnet'}</small></span>
              <span className={styles.status} data-tone={t.short ? 'amber' : 'moss'}>{t.short ? 'Needs you: their next needs exceed the balance' : 'Covered today'}</span></li>
          ))}
        </ul>
      </div>
    </section>
  )
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
  const v2 = useMyCharters(address, true)
  const chains = [...new Set([...(q.data ?? []), ...(v2.data ?? [])].filter((x) => x.status === 'armed').map((x) => x.chainId))] as Array<56 | 97>
  const claims = useClaims(address, chains)
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
      {claims.data ? <ClaimsPanel claims={claims.data} /> : null}
      {guards.length || v2.data?.length ? (
        <ul className={styles.list}>
          {(v2.data ?? []).map((c) => <V2Row key={`${c.chainId}:${c.address}`} c={c} />)}
          {guards.map((g) => <Row key={`${g.chainId}:${g.address}`} g={g} />)}
        </ul>
      ) : (
        <div className={styles.empty}>
          <p>No charters yet. A charter does one job for you, only when the chain shows the condition: guard a Venus loan, sweep idle stablecoins into Venus, trade a price band, or keep a PancakeSwap range.</p>
          <a className="btn btn--primary" href={`/charters/new?account=${address}`}>Grant a charter</a>
        </div>
      )}
      {(guards.length || v2.data?.length) && !guards.some((g) => g.status === 'armed') && !(v2.data ?? []).some((c) => c.status === 'armed') ? (
        <div className={styles.suggest}><p>None of your charters is armed now.</p><a className="btn btn--sm" href={`/charters/new?account=${address}`}>Grant a charter</a></div>
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
