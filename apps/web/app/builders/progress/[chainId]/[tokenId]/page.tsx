import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { checkAgent, isSupportedChain, network, type ChainId } from '@marque/commerce'
import { SiteHeader, SiteFooter } from '../../../../_components/SiteHeader'
import { ListingControl } from './ListingControl'
import styles from './progress.module.css'

export const dynamic = 'force-dynamic'

/**
 * /builders/progress/{chainId}/{tokenId}: BNB Chain's Set and Earn build checks for one agent, each in one of three
 * honest states. "Met" only when Marque read it from chain or from its own probes; "Not yet" with the count it has;
 * "Marque cannot verify" for what chain data cannot show. Funding independence is always the third.
 */
type Agent = NonNullable<Awaited<ReturnType<typeof checkAgent>>>
type C = { state: string; reason: string; [k: string]: unknown }
type Row = { title: string; state: 'met' | 'not_yet' | 'unverifiable'; reason: string; next?: { label: string; href: string } | null }
const WORD = { met: 'Met', not_yet: 'Not yet', unverifiable: 'Marque cannot verify' } as const

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const st = (c: C | undefined): Row['state'] => (c?.state === 'observed' ? 'met' : c?.state === 'not_yet' ? 'not_yet' : 'unverifiable')

function rows(a: Agent): Row[] {
  const c = a.checks as Record<string, C>
  const timing = c['timing'], card = c['card'], probes = c['probes'], hires = c['hires'], actions = c['actions'], category = c['category']
  const cat = typeof card?.['category'] === 'string' ? String(card['category']).replace('_', ' ') : null
  return [
    { title: 'Registered in the campaign window', state: st(timing), reason: timing?.reason ?? 'Not read.' },
    { title: 'Discoverable agent card', state: card?.state === 'observed' || (card?.state === 'not_yet' && card.reason.startsWith('The card is valid')) ? 'met' : st(card), reason: card?.reason ?? 'Not read.', next: (card?.['next'] as Row['next']) ?? null },
    { title: 'Responsive endpoint', state: st(probes), reason: probes?.reason ?? 'Not read.', next: (probes?.['next'] as Row['next']) ?? null },
    { title: 'Completed hires from three wallets that are not the owner', state: st(hires), reason: hires?.reason ?? 'Not read.' },
    {
      title: 'Five category-consistent actions on three separate days', state: category?.state === 'observed' && actions?.state === 'observed' ? 'met' : category?.state === 'not_observable' || actions?.state === 'not_observable' ? 'unverifiable' : 'not_yet',
      reason: [actions?.reason, category?.reason].filter(Boolean).join(' '),
    },
    { title: 'Declared category', state: cat ? 'met' : 'not_yet', reason: cat ? `Its card describes a ${cat} agent.` : 'Marque could not read a category from its card yet.' },
  ]
}

export async function generateMetadata({ params }: { params: Promise<{ chainId: string; tokenId: string }> }) {
  const { chainId, tokenId } = await params
  return { title: `Build checklist for agent #${tokenId} on ${chainId === '97' ? 'BSC testnet' : 'BSC mainnet'}`, description: 'Every Set and Earn build check for one ERC-8004 agent, read from chain, with what Marque cannot verify said plainly.' }
}

export default async function BuildProgress({ params }: { params: Promise<{ chainId: string; tokenId: string }> }) {
  const { chainId: c, tokenId } = await params
  const chainId = Number(c)
  if (!isSupportedChain(chainId) || !/^\d{1,12}$/.test(tokenId)) notFound()
  const p = await cachedProjection(`buildprog:v1:${chainId}:${tokenId}`, () => checkAgent(chainId as ChainId, tokenId), { freshMs: 5 * 60_000, timeoutMs: 25_000 }).catch(() => null)
  if (p && p.value === null) notFound()
  const a = p?.value ?? null
  const agentKey = `${chainId}:${network(chainId as ChainId).identityRegistry.toLowerCase()}:${tokenId}`
  const [listing] = rowsOf(await db().execute(sql`select status, published_at, withdrawn_at, lower(owner_address) as owner from builder_listing where agent_id = ${agentKey} order by id desc limit 1`).catch(() => []))
  const listed = listing?.['status'] === 'published'
  const list = a ? rows(a) : []
  const met = list.filter((r) => r.state === 'met').length
  const hiresC = a ? (a.checks as Record<string, C>)['hires'] : undefined
  const profile = chainId === 97 ? `/agents/97/${tokenId}` : `/agents/${tokenId}`
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className={styles.kicker}>Set and Earn build checklist</span>
          <h1 className="t-display">{a?.name ?? `Agent #${tokenId}`}</h1>
          <p className={styles.meta}>ERC-8004 #{tokenId} on {chainId === 97 ? 'BSC testnet' : 'BSC mainnet'} · <Link href={profile}>Agent page</Link>{p ? ` · read ${new Date(p.computedAt).toISOString().slice(11, 16)} UTC` : ''}</p>
          <p className={styles.lede}>Hires on Marque name your agent&apos;s own wallet in the escrow, and this page shows every check the campaign asks for.</p>
        </header>

        {!a ? <p className={styles.note} role="status">The checks could not be read from chain just now. Try again in a minute.</p> : (
          <>
            <p className={styles.score}><b>{met}</b> of {list.length} checks met</p>
            <ol className={styles.list}>
              {list.map((r) => (
                <li key={r.title} data-state={r.state}>
                  <span className={styles.state} data-state={r.state}>{WORD[r.state]}</span>
                  <div>
                    <h2 className={styles.title}>{r.title}</h2>
                    <p className={styles.reason}>{r.reason}</p>
                    {r.next && r.state !== 'met' ? <Link className={styles.next} href={r.next.href}>{r.next.label}</Link> : null}
                  </div>
                </li>
              ))}
              <li data-state="unverifiable">
                <span className={styles.state} data-state="unverifiable">{WORD.unverifiable}</span>
                <div>
                  <h2 className={styles.title}>Hirers not funded by the builder</h2>
                  <p className={styles.reason}>Funding independence cannot be fully verified from chain data, so it is never shown as met. {hiresC?.['method'] === 'token_and_bnb_transfers_checked' ? 'Marque checks direct BNB and token transfers from the owner and agent wallets to each hirer; transfers through other wallets or contracts are not visible to it.' : 'Marque could not read transfer history this time.'}</p>
                </div>
              </li>
            </ol>
          </>
        )}

        <section className={styles.listing} aria-labelledby="listing">
          <h2 id="listing" className={styles.h2}>Listing on Marque</h2>
          <p className={styles.reason}>{listed ? `Listed by its owner on ${new Date(String(listing!['published_at'])).toISOString().slice(0, 10)}${chainId === 97 ? ', in the practice lane with the chip "Built by an outside builder" when the owner is outside the Marque team' : ''}.` : listing?.['status'] === 'withdrawn' ? `Delisted by its owner on ${new Date(String(listing['withdrawn_at'])).toISOString().slice(0, 10)}.` : 'Not listed by its owner yet.'} The escrow provider is always the agent&apos;s own registered wallet, never a Marque wallet. Listing and delisting each take one signed message, not a transaction.</p>
          <ListingControl chainId={chainId as 56 | 97} tokenId={tokenId} listed={listed} />
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
