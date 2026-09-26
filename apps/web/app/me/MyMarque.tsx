'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useConfig, useReadContracts } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { switchChain, waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { erc20Abi, formatUnits } from 'viem'
import { friendlyError, NETWORKS, revokeAllowanceCall, type ChainId, type FriendlyError } from '@marque/commerce/client'
import { AddressChip, Badge, Button, ButtonLink, EmptyState, ErrorNote, ErrorState, HashChip, QuestProgress, SectionHead, Skeleton, Stars } from '../_components/ui'
import { QUEST_CATEGORIES, questStates, useWalletQuest, type WalletHire } from '../_components/shell/useQuest'
import { toast } from '../../lib/toast'
import { explorerTx } from '../../lib/network'
import { utcDay } from '../../lib/time'
import styles from './me.module.css'

/**
 * My Marque (DESIGN-SYSTEM.md 8.7): quest, active jobs, history, spending
 * controls, ratings you gave, your agents and what they earned. A projection of
 * chain records keyed by the address: no account, nothing stored. With ?addr= it
 * reads any address, and the controls are read-only.
 */
const ADDR = /^0x[0-9a-fA-F]{40}$/
const ACTIVE = new Set(['OPEN', 'FUNDED', 'SUBMITTED', 'DISPUTED'])
const STATE: Record<string, string> = { OPEN: 'Not paid', FUNDED: 'Working', SUBMITTED: 'Delivered', DISPUTED: 'Disputed', COMPLETED: 'Settled', PAID: 'Paid', CANCELLED: 'Cancelled', REJECTED: 'Rejected', EXPIRED: 'Expired', REFUNDED: 'Refunded' }
const CAT: Record<string, string> = { yield: 'Yield', grid: 'Grid', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }
const amt = (h: WalletHire) => (h.amount && h.token ? `${Number(formatUnits(BigInt(h.amount), h.token.decimals)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${h.token.symbol}` : 'unpaid')

interface OwnerAgent { agentKey: string; chainId: number; agentId: string; name: string; category: string | null; listedOnMarque: boolean; liveness: string | null; quality: { checks: Array<{ id: string; pass: boolean; fix: string | null }> }; jobsReceived: number; jobsPaid: number }
const CHECK: Record<string, string> = { identity: 'ERC-8004 identity', owner_verified: 'Ownership proved', callable_24h: 'Answers live calls', classified: 'In a quest category', test_call: 'Passed the live test' }

export function MyMarque({ addrParam, chainId }: { addrParam: string | null; chainId: ChainId }) {
  const { address: connected, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const address = addrParam ?? connected ?? null
  const own = Boolean(address && connected && address.toLowerCase() === connected.toLowerCase())
  const quest = useWalletQuest(address ?? undefined)
  const [owner, setOwner] = useState<OwnerAgent[] | null>(null)

  useEffect(() => {
    if (!address) { setOwner(null); return }
    let live = true
    fetch(`/api/v1/phase2/owner/${address}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setOwner(j?.agents ?? []) }).catch(() => { if (live) setOwner([]) })
    return () => { live = false }
  }, [address])

  if (!address) {
    return (
      <div className={styles.empty}>
        <span className="t-label">My Marque</span>
        <h1>Your jobs, your controls, your agents.</h1>
        <p>Connect a wallet to see every hire it made, its quest progress, the allowances it has granted, and any agent it owns. Nothing is stored; the wallet is the identity.</p>
        <div className={styles.row}><Button variant="primary" onClick={openConnectModal}>Connect wallet</Button><AddrForm /></div>
      </div>
    )
  }

  const hires = quest.data?.hires ?? []
  const active = hires.filter((h) => ACTIVE.has(h.state))
  const rated = hires.filter((h) => h.rating)
  const states = questStates(quest.data)

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <span className="t-label">My Marque{own ? '' : ' · viewing an address'}</span>
        <h1>{own ? 'Your jobs, your controls, your agents.' : 'Jobs, controls and agents for this address.'}</h1>
        <div className={styles.row}>
          <AddressChip value={address} chainId={chainId} label={own ? 'You' : undefined} />
          <a className="link" href={`/positions?address=${address}`}>Positions of this address</a>
          {!own && isConnected ? <a className="link" href="/me">Back to my wallet</a> : null}
        </div>
      </header>

      {quest.isError ? <ErrorState source="The Quest Index" changed="Nothing on chain is affected." action={<Button size="sm" onClick={() => quest.refetch()}>Try again</Button>} /> : null}

      <section className={styles.section} aria-labelledby="me-quest">
        <SectionHead id="me-quest" label="Set and Earn" note={quest.data ? `as of block ${Number(Object.values(quest.data.asOfBlock)[0] ?? 0).toLocaleString('en-US')}` : undefined} />
        <div className={styles.questRow}>
          <QuestProgress states={states} label="Quest" />
          <ul className={styles.questCats}>
            {QUEST_CATEGORIES.map(({ key, name }, i) => <li key={key} data-state={states[i]}>{name}</li>)}
            <li data-state={states[4]}>Listed</li>
          </ul>
          <ButtonLink size="sm" href={own ? '/quest' : `/quest?addr=${address}`}>{states.every((s) => s === 'done') ? 'View the quest' : 'Continue the quest'}</ButtonLink>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="me-active">
        <SectionHead id="me-active" label="Active jobs" note={quest.data ? `${active.length}` : undefined} />
        {quest.isPending ? <Rows /> : active.length ? <JobList hires={active} /> : <p className={styles.muted}>No job is in progress. Paid jobs stay here until they settle.</p>}
      </section>

      <section className={styles.section} aria-labelledby="me-history">
        <SectionHead id="me-history" label="History" note={quest.data ? `${hires.length} ${hires.length === 1 ? 'job' : 'jobs'}` : undefined} />
        {quest.isPending ? <Rows /> : hires.length ? <JobList hires={[...hires].reverse()} /> : (
          <EmptyState title="No jobs yet" action={<ButtonLink size="sm" variant="primary" href="/quest">Start the quest</ButtonLink>}>Hires this wallet pays for appear here, every step read from the chain.</EmptyState>
        )}
      </section>

      <section className={styles.section} aria-labelledby="me-controls" id="controls">
        <SectionHead id="me-controls" label="Spending controls" title="What the escrow may take" lede={`Your allowance to BNB Chain's ERC-8183 escrow contract, per token. Marque only ever asks for the exact price of a hire, so these are normally zero. Revoking does not touch money already in escrow for a job.`} />
        <Allowances address={address} chainId={chainId} own={own} />
      </section>

      <section className={styles.section} aria-labelledby="me-ratings">
        <SectionHead id="me-ratings" label="Ratings you gave" note={quest.data ? `${rated.length}` : undefined} />
        {rated.length ? (
          <ul className={styles.list}>
            {rated.map((h) => (
              <li key={h.jobKey}>
                <span className={styles.listMain}><strong>{h.agent.name}</strong><span className={styles.muted}>{CAT[h.agent.category ?? ''] ?? ''} · job {h.jobId}</span></span>
                <Stars value={h.rating!.stars ?? h.rating!.value / 20} count={1} mine />
                {h.rating!.tx ? <HashChip value={h.rating!.tx} chainId={h.chainId} /> : null}
              </li>
            ))}
          </ul>
        ) : <p className={styles.muted}>{hires.some((h) => ['SUBMITTED', 'COMPLETED', 'PAID'].includes(h.state)) ? 'You have delivered jobs to rate: open one from History.' : 'Rate an agent after it delivers; the rating is signed by your wallet on chain.'}</p>}
      </section>

      <section className={styles.section} aria-labelledby="me-agents">
        <SectionHead id="me-agents" label="Your agents" note={owner ? `${owner.length}` : undefined} />
        {owner === null ? <Rows /> : owner.length ? (
          <ul className={styles.agents}>
            {owner.map((a) => {
              const passed = a.quality.checks.filter((c) => c.pass).length
              return (
                <li key={a.agentKey}>
                  <div className={styles.agentHead}>
                    <strong>{a.name}</strong>
                    <span className={styles.muted}>ERC-8004 #{a.agentId} · {CAT[a.category ?? ''] ?? 'Unclassified'}</span>
                    {a.listedOnMarque ? <Badge kind="hireable" /> : <span className={styles.muted}>{passed} of {a.quality.checks.length} checks passed</span>}
                  </div>
                  <ul className={styles.checks}>
                    {a.quality.checks.map((c) => <li key={c.id} data-pass={c.pass}>{CHECK[c.id] ?? c.id}{!c.pass && c.fix ? <span className={styles.fix}>{c.fix}</span> : null}</li>)}
                  </ul>
                  <p className={styles.earn}>Jobs received <strong>{a.jobsReceived}</strong> · paid out <strong>{a.jobsPaid}</strong></p>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState title="No agents owned by this address" action={<ButtonLink size="sm" href="/builders">List an agent</ButtonLink>}>Build one with BNB Agent Studio and register it on ERC-8004; it shows up here with its listing checks and earnings.</EmptyState>
        )}
      </section>

      <p className={styles.muted}>Looking for charters? They live in the <a className="link" href="/app/charters">charter sandbox (testnet)</a>.</p>
    </div>
  )
}

function JobList({ hires }: { hires: WalletHire[] }) {
  return (
    <ul className={styles.jobs}>
      {hires.map((h) => (
        <li key={h.jobKey}>
          <a href={`/jobs/${h.chainId}/${h.jobId}`} className={styles.job}>
            <span className={styles.jobMain}><strong>{h.agent.name}</strong><span className={styles.muted}>{CAT[h.agent.category ?? ''] ?? 'Agent'} · job {h.jobId}</span></span>
            <span className="num">{amt(h)}</span>
            <span className={styles.jobState} data-state={h.state}>{STATE[h.state] ?? h.state}</span>
            <span className={styles.muted}>{h.timestamps['created'] ? utcDay(h.timestamps['created']) : ''}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function Allowances({ address, chainId, own }: { address: string; chainId: ChainId; own: boolean }) {
  const config = useConfig()
  const { chainId: walletChain } = useAccount()
  const assets = NETWORKS[chainId].assets
  const commerce = NETWORKS[chainId].commerce
  const reads = useReadContracts({
    contracts: assets.map((a) => ({ address: a.address, abi: erc20Abi, functionName: 'allowance' as const, args: [address as `0x${string}`, commerce] as const, chainId })),
    query: { refetchInterval: 30_000 },
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<FriendlyError | null>(null)
  const rows = useMemo(() => assets.map((a, i) => ({ a, v: reads.data?.[i]?.result as bigint | undefined })), [assets, reads.data])

  const revoke = async (a: (typeof assets)[number]) => {
    setBusy(a.symbol); setError(null)
    try {
      const c = revokeAllowanceCall(chainId, { address: a.address, symbol: a.symbol })
      if (walletChain !== chainId) await switchChain(config, { chainId })
      const hash = await writeContract(config, { address: c.to, abi: c.abi, functionName: c.functionName, args: c.args as unknown[], chainId })
      await waitForTransactionReceipt(config, { hash, chainId })
      toast({ tone: 'success', title: `${a.symbol} allowance set to zero`, body: 'The escrow can no longer take this token until you approve again.', href: explorerTx(chainId, hash) })
      await reads.refetch()
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(null) }
  }

  return (
    <div className={styles.allow}>
      <div className={styles.allowHead}><span>Token</span><span>Allowed to the escrow</span><span /></div>
      {rows.map(({ a, v }) => (
        <div key={a.symbol} className={styles.allowRow}>
          <span><strong>{a.symbol}</strong><span className={styles.muted}>{a.isDefault ? ' · escrow default' : ''}</span></span>
          <span className="num">{v === undefined ? (reads.isError ? 'could not read' : <Skeleton w={60} h={14} />) : v === 0n ? 'zero' : Number(formatUnits(v, a.decimals)).toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
          <span>{own && v !== undefined && v > 0n ? <Button size="sm" variant="danger" loading={busy === a.symbol} disabled={busy !== null} onClick={() => revoke(a)}>Revoke to zero</Button> : v === 0n ? <span className={styles.muted}>Nothing to revoke</span> : null}</span>
        </div>
      ))}
      <p className={styles.muted}>Escrow contract <AddressChip value={commerce} chainId={chainId} /> on {chainId === 56 ? 'BSC mainnet' : 'BSC testnet'}.</p>
      {error ? <ErrorNote error={error} /> : null}
    </div>
  )
}

function Rows() {
  return <div className={styles.rowsSkel}>{[0, 1, 2].map((i) => <Skeleton key={i} h={56} />)}</div>
}

function AddrForm() {
  const [v, setV] = useState('')
  const ok = ADDR.test(v)
  return (
    <form className={styles.addrForm} onSubmit={(e) => { e.preventDefault(); if (ok) window.location.href = `/me?addr=${v}` }}>
      <input aria-label="Any BNB Smart Chain address" placeholder="…or paste any 0x address" value={v} onChange={(e) => setV(e.target.value.trim())} spellCheck={false} />
      <Button type="submit" size="sm" disabled={!ok}>View</Button>
    </form>
  )
}
