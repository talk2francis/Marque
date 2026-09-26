'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useBalance, useReadContracts } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { erc20Abi, formatUnits } from 'viem'
import { ArrowUpRight, Check, Share2 } from 'lucide-react'
import { AddressChip, Badge, Button, ButtonLink, Disclosure, ErrorState, HashChip, QuestProgress, QuestTracker, Skeleton, type QuestStep, type QuestStepState } from '../_components/ui'
import { QUEST_CATEGORIES, questStates, useWalletQuest, type WalletHire } from '../_components/shell/useQuest'
import type { QuestCategoryRecs, QuestRec } from '../../lib/quest-recs'
import { explorerTx } from '../../lib/network'
import styles from './quest.module.css'

type Tok = { address: string; symbol: string; decimals: number }
const ADDR = /^0x[0-9a-fA-F]{40}$/
const USDT_SWAP = (u: string) => `https://pancakeswap.finance/swap?chain=bsc&inputCurrency=0x55d398326f99059fF775485246999027B3197955&outputCurrency=${u}`
const REASON: Record<string, string> = {
  team_wallet: 'This wallet is on Marque\'s published team list, so its hires are shown but never count for the campaign.',
  self_hire: 'A hire of an agent this wallet owns does not count.',
  zero_deposit: 'A hire must pay a real amount into escrow to count.',
  not_marque: 'Only hires started on Marque count.',
  not_delivered: 'A hire counts once the agent delivers.',
  rating_unbound: 'A rating counts only for a job this wallet paid for.',
  duplicate_category: 'Only one hire per category counts.',
}
const amt = (raw: string | null, t: { decimals: number; symbol: string } | null) => (raw && t ? `${Number(formatUnits(BigInt(raw), t.decimals)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${t.symbol}` : null)

export function QuestView({ chainId, recs, recsAt, u, usdt }: { chainId: number; recs: QuestCategoryRecs[] | null; recsAt: string | null; u: Tok | null; usdt: Tok | null }) {
  const params = useSearchParams()
  const view = params.get('addr')
  const { address: connected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const target = view && ADDR.test(view) ? view : connected
  const own = Boolean(target && connected && target.toLowerCase() === connected.toLowerCase())
  const quest = useWalletQuest(target)
  const [owner, setOwner] = useState<{ agents: Array<{ name: string; quality: { checks: Array<{ id: string; pass: boolean; fix: string | null }> }; listedOnMarque: boolean }> } | null>(null)

  useEffect(() => {
    if (!target) { setOwner(null); return }
    let live = true
    fetch(`/api/v1/phase2/owner/${target}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setOwner(j) }).catch(() => undefined)
    return () => { live = false }
  }, [target])

  const bnb = useBalance({ address: own ? connected : undefined, chainId, query: { enabled: own, refetchInterval: 20_000 } })
  const toks = useReadContracts({
    contracts: own && connected && u && usdt ? [
      { address: u.address as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [connected], chainId },
      { address: usdt.address as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [connected], chainId },
    ] : [],
    query: { enabled: own, refetchInterval: 20_000 },
  })

  const states: QuestStepState[] = questStates(quest.data)
  const firstOpen = states.findIndex((s) => s !== 'done')
  const data = quest.data
  const recFor = (cat: string) => recs?.find((r) => r.category === cat) ?? null
  const hireFor = (cat: string): WalletHire | null => {
    if (!data) return null
    const key = data.quest.categories[cat as keyof typeof data.quest.categories]?.jobKey
    return (key ? data.hires.find((h) => h.jobKey === key) : null) ?? data.hires.find((h) => h.agent.category === cat && h.state !== 'CANCELLED') ?? null
  }

  const steps: QuestStep[] = QUEST_CATEGORIES.map(({ key, name }, i) => {
    const st: QuestStepState = states[i] === 'todo' && i === firstOpen ? 'next' : states[i]!
    const h = hireFor(key)
    const rec = recFor(key)
    if ((st === 'done' || st === 'waiting') && h) {
      const price = amt(h.amount, h.token)
      const rated = h.rating ? `rated ${h.rating.stars ?? Math.round(h.rating.value / 20)} of 5` : null
      const pending = h.tx['funded'] ?? h.tx['created']
      return {
        key, name, state: st,
        detail: <>{h.agent.name}{price ? ` · ${price}` : ''}{rated ? ` · ${rated}` : ''}{st === 'waiting' && pending ? <> · <a href={explorerTx(h.chainId, pending)} target="_blank" rel="noreferrer">{h.state === 'FUNDED' ? 'working' : 'confirming'}</a></> : null}</>,
        actions: <>
          {st === 'done' && !h.rating && own ? <ButtonLink size="sm" variant="primary" href={`/jobs/${h.chainId}/${h.jobId}`}>Rate it</ButtonLink> : null}
          <ButtonLink size="sm" href={`/jobs/${h.chainId}/${h.jobId}`}>View job</ButtonLink>
        </>,
      }
    }
    return {
      key, name, state: st,
      detail: rec?.best ? <RecLine r={rec.best} /> : <span className={styles.muted}>{recs ? 'No agent can be hired in this category right now.' : 'Recommendations are not available just now.'}</span>,
      actions: <>
        {rec?.best ? <Link className={`btn btn--sm ${st === 'next' ? 'btn--primary' : ''}`} href={`?${new URLSearchParams({ ...(view ? { addr: view } : {}), hire: rec.best.agentKey })}`} scroll={false}>Hire</Link> : null}
        {rec && rec.hireable > 1 ? <ButtonLink size="sm" variant="quiet" href={`/register/${key}`}>See all {rec.hireable}</ButtonLink> : null}
      </>,
    }
  })

  const best = owner?.agents?.length ? owner.agents.reduce((a, b) => (b.quality.checks.filter((c) => c.pass).length > a.quality.checks.filter((c) => c.pass).length ? b : a)) : null
  const passes = best ? best.quality.checks.filter((c) => c.pass).length : 0
  const listedState = states[4]!
  steps.push({
    key: 'listed', name: 'List your agent', state: listedState === 'todo' && firstOpen === 4 ? 'next' : listedState,
    detail: listedState === 'done' ? <>Listed on Marque</> : best ? <>{best.name} · {passes} of {best.quality.checks.length} checks passed</> : <>Build an agent with BNB Agent Studio, then list it here</>,
    actions: listedState === 'done' ? null : <ButtonLink size="sm" href="/builders">{best ? 'Continue' : 'Start'}</ButtonLink>,
  })

  const remaining = QUEST_CATEGORIES.filter((_, i) => states[i] !== 'done').map(({ key }) => recFor(key)?.best).filter((r): r is QuestRec => Boolean(r))
  const sameToken = remaining.every((r) => r.token?.symbol === remaining[0]?.token?.symbol)
  const total = remaining.length && sameToken && remaining[0]?.token ? remaining.reduce((s, r) => s + BigInt(r.priceRaw ?? '0'), 0n) : null
  const totalLabel = total !== null ? amt(total.toString(), remaining[0]!.token!) : null
  const complete = states.every((s) => s === 'done') && data?.quest.ratedAll
  const doneCount = states.filter((s) => s === 'done').length

  const uBal = toks.data?.[0]?.result as bigint | undefined
  const usdtBal = toks.data?.[1]?.result as bigint | undefined
  const needU = total !== null && uBal !== undefined && u && remaining[0]?.token?.symbol === u.symbol ? uBal < total : false

  return (
    <div className={styles.body}>
      <section className={styles.wallet} aria-label="Your wallet">
        {target ? (
          <>
            <div className={styles.walletLeft}>
              <span className="t-label">{own ? 'Your wallet' : 'Viewing'}</span>
              <AddressChip value={target} chainId={chainId} />
              <QuestProgress states={states} label="Quest" />
            </div>
            {own ? (
              <div className={styles.bals}>
                <Bal label="BNB for fees" v={bnb.data ? Number(formatUnits(bnb.data.value, 18)) : null} unit="BNB" ok={bnb.data ? bnb.data.value > 0n : null} />
                {u ? <Bal label={u.symbol} v={uBal !== undefined ? Number(formatUnits(uBal, u.decimals)) : null} unit={u.symbol} ok={uBal !== undefined ? !needU : null} /> : null}
                {usdt ? <Bal label="USDT" v={usdtBal !== undefined ? Number(formatUnits(usdtBal, usdt.decimals)) : null} unit="USDT" ok={null} /> : null}
                {u ? <ButtonLink size="sm" href={USDT_SWAP(u.address)} external>Get {u.symbol}<ArrowUpRight /></ButtonLink> : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.connect}>
            <p>Connect a wallet to track your progress. You can read every step and price below without one.</p>
            <Button variant="primary" onClick={openConnectModal}>Connect wallet</Button>
          </div>
        )}
      </section>

      {needU ? <p className={styles.warn}>The agents below are priced in {u!.symbol}. You hold {Number(formatUnits(uBal!, u!.decimals)).toFixed(4)} and the rest of the quest costs {totalLabel}. Swap USDT for {u!.symbol} on PancakeSwap first.</p> : null}
      {data && !data.quest.eligible && data.quest.reasons.length ? (
        <p className={styles.note}>{data.quest.reasons.map((r) => REASON[r] ?? r).join(' ')}</p>
      ) : null}

      {quest.isError ? <ErrorState source="The Quest Index" changed="Your hires on chain are unaffected." action={<Button size="sm" onClick={() => quest.refetch()}>Try again</Button>} /> : null}
      {target && quest.isPending ? (
        <div className={styles.skel}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={68} />)}</div>
      ) : (
        <QuestTracker steps={steps} />
      )}

      <div className={styles.foot}>
        <p>{remaining.length ? <>To finish: {totalLabel ? <strong>{totalLabel}</strong> : 'the prices above'} plus network fees, across {remaining.length} {remaining.length === 1 ? 'hire' : 'hires'}.</> : doneCount >= 4 ? 'All four hires are done.' : null} Prices are live quotes{recsAt ? `, read ${new Date(recsAt).toISOString().slice(11, 16)} UTC` : ''}.</p>
        <p className={styles.muted}>Progress is read from the chain. Check it yourself: {target ? <a href={`/api/v1/phase2/wallet/${target}`}>/api/v1/phase2/wallet/{target.slice(0, 6)}…{target.slice(-4)}</a> : <a href="/api/v1/phase2/config">/api/v1/phase2/config</a>}</p>
      </div>

      {complete && data ? <Complete hires={QUEST_CATEGORIES.map(({ key }) => hireFor(key)).filter((h): h is WalletHire => Boolean(h))} address={target!} /> : null}

      <Disclosure summary="What counts, exactly" boxed>
        <ul className={styles.rules}>
          <li>A hire counts when it was started on Marque, paid into BNB Chain&apos;s ERC-8183 escrow with a real amount, and the agent delivered.</li>
          <li>One hire per category: Yield, Grid, Rebalancing and Health factor.</li>
          <li>A rating counts when the wallet that paid rates that agent on the ERC-8004 reputation registry.</li>
          <li>Listing counts when an ERC-8004 agent you own passes Marque&apos;s five listing checks.</li>
          <li>Team wallets are shown but excluded. Nothing here is set by hand: <a href="/protocol">see the contracts and events</a>.</li>
        </ul>
      </Disclosure>
    </div>
  )
}

function RecLine({ r }: { r: QuestRec }) {
  return (
    <span className={styles.rec}>
      <span className={styles.recLabel}>Recommended</span>
      <strong>{r.name}</strong>
      {r.priceLabel ? <span className="num">{r.priceLabel}</span> : null}
      {r.warranted ? <Badge kind="warranted" date={r.warranted.date ?? ''} /> : null}
      {r.firstParty ? <Badge kind="reference" /> : null}
      {r.rating.count ? <span className={styles.muted}>{r.rating.averageStars?.toFixed(1)} of 5 from {r.rating.count}</span> : null}
    </span>
  )
}

function Bal({ label, v, unit, ok }: { label: string; v: number | null; unit: string; ok: boolean | null }) {
  return (
    <span className={styles.bal} data-ok={ok === null ? undefined : ok}>
      <span className={styles.balLabel}>{label}</span>
      <span className="num">{ok ? <Check aria-hidden="true" /> : null}{v === null ? 'reading' : `${v.toLocaleString('en-US', { maximumFractionDigits: 4 })}${label === unit ? '' : ` ${unit}`}`}</span>
    </span>
  )
}

function Complete({ hires, address }: { hires: WalletHire[]; address: string }) {
  const share = useMemo(() => {
    const url = `https://marque.trade/quest?addr=${address}`
    const text = 'I hired an agent in every category on @marquetrade: yield, grid, rebalancing and health factor, each paid through BNB Chain escrow and rated on chain.'
    return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
  }, [address])
  return (
    <section className={styles.complete} data-surface="chamber" aria-labelledby="quest-complete">
      <span className="t-label">Set and Earn</span>
      <h2 id="quest-complete" className="t-serif">Quest complete.</h2>
      <p>Every hire below was paid into escrow, delivered and rated, all from this wallet and all on chain.</p>
      <ul className={styles.completeList}>
        {hires.map((h) => (
          <li key={h.jobKey}>
            <span>{h.agent.name}</span>
            {h.tx['funded'] ? <HashChip value={h.tx['funded']} chainId={h.chainId} label="Paid" /> : null}
            {h.rating?.tx ? <HashChip value={h.rating.tx} chainId={h.chainId} label="Rated" /> : null}
          </li>
        ))}
      </ul>
      <div className={styles.completeActions}>
        <ButtonLink href={share} external variant="primary"><Share2 />Share on X</ButtonLink>
        <ButtonLink href="/me">Open My Marque</ButtonLink>
      </div>
    </section>
  )
}
