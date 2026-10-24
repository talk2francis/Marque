import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { isSupportedChain, network } from '@marque/commerce'
import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../../../_components/SiteHeader'
import { storefrontByToken } from '../../../../../lib/storefront'
import { LaunchKit } from '../../../LaunchKit'
import styles from '../../../builders.module.css'

export const dynamic = 'force-dynamic'

/**
 * A public fix report for one agent (SPEC-SUPPLY 8): why buyers on Marque cannot hire it yet, in
 * one line, and the exact fix, from Marque's own quote checks. Read-only; no signature, no contact.
 */
const FIX: Record<string, { why: string; fix: string }> = {
  provider_mismatch: { why: 'Its price pays a different wallet than the one it registered.', fix: 'Sign quotes with the agent wallet registered on ERC-8004, or point the agent wallet at the signing key (setAgentWallet on the identity registry).' },
  bad_signature: { why: 'Its quote signature does not match the terms it quoted.', fix: 'Sign keccak256 of the canonical description content (BNB Agent Studio SDK buildDescriptionContent) with the agent wallet.' },
  unsigned: { why: 'Its quote is not signed.', fix: 'Return the SDK NegotiationResult with provider_sig, or a plain quote whose provider is the registered agent wallet.' },
  no_quote: { why: 'Its endpoint answers, but it does not quote a price.', fix: 'Serve the negotiate skill on the A2A endpoint in the agent card (BNB Agent Studio seller runtime).' },
  declined: { why: 'It refuses the tasks buyers send.', fix: 'Accept plain-English tasks, or publish a work-skill example in the agent card so marketplaces can send your format.' },
  unreachable: { why: 'Its endpoint did not answer a price check in time.', fix: 'Make the A2A endpoint answer negotiate within 8 seconds over HTTPS.' },
  not_a2a: { why: 'Its endpoint does not answer as an A2A agent.', fix: 'Answer JSON-RPC message/send at the URL named in the agent card.' },
  malformed: { why: 'Its quote is missing required fields.', fix: 'Return chain_id, verifying_contract, terms.price, terms.currency, negotiated_at and quote_expires_at (at most 900 s later).' },
  currency_unsupported: { why: 'It quotes in a token the escrow does not accept.', fix: 'Quote in U or another token the ERC-8183 kernel supports on this network.' },
  wrong_contract: { why: 'Its quote names a different escrow contract.', fix: 'Set verifying_contract to the network’s ERC-8183 AgenticCommerce contract.' },
  chain_unsupported: { why: 'Its quote is for a network Marque does not list.', fix: 'Quote on BSC mainnet (56) or BSC testnet (97).' },
  wrong_lane: { why: 'Its quote is for the other network than its identity.', fix: 'Quote on the chain the agent is registered on.' },
  expired: { why: 'Its quotes arrive already expired.', fix: 'Set quote_expires_at a few minutes ahead (at most 15 minutes).' },
  task_mismatch: { why: 'Its signed quote is for a different task than the one asked.', fix: 'Echo the buyer’s task_description unchanged in the signed request.' },
  no_price: { why: 'Its quote has no positive price.', fix: 'Quote a price above zero.' },
}

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

export async function generateMetadata({ params }: { params: Promise<{ chainId: string; tokenId: string }> }) {
  const { tokenId } = await params
  return { title: `Fix report for agent #${tokenId}`, description: 'Why buyers cannot hire this agent on Marque yet, and the exact fix.' }
}

export default async function FixReport({ params }: { params: Promise<{ chainId: string; tokenId: string }> }) {
  const { chainId: c, tokenId } = await params
  const chainId = Number(c)
  if (!isSupportedChain(chainId) || !/^\d{1,9}$/.test(tokenId)) notFound()
  const id = `${chainId}:${network(chainId).identityRegistry.toLowerCase()}:${tokenId}`
  const [a] = rowsOf(await db().execute(sql`select name, agent_wallet, owner_address from agent where id = ${id}`))
  if (!a) notFound()
  const quotes = rowsOf(await db().execute(sql`select created_at, ok, failure, left(detail, 240) as detail, provider from commerce_quote where agent_id = ${id} and source = 'probe' order by created_at desc limit 5`))
  const latest = quotes[0]
  const fix = latest && !latest['ok'] ? FIX[String(latest['failure'])] ?? null : null
  const name = String(a['name'] ?? `Agent #${tokenId}`)
  // Launch kit facts come from the same projection as the agent page: the live terms and its own test.
  const sf = latest?.['ok'] ? await storefrontByToken(tokenId, chainId as 56 | 97).catch(() => null) : null
  const TEST: Record<string, string> = { yield: 'MCS-YIELD-1', grid: 'MCS-GRID-1', rebalancing: 'MCS-REB-1', health_factor: 'MCS-HF-1' }
  const own = sf?.category ? sf.tests.find((t) => t.testId === TEST[sf.category!]) : undefined
  const warrant = own?.pass && own.ranAt && Date.now() - Date.parse(own.ranAt) <= 72 * 3_600_000 ? own.testId : null
  const profile = `/agents/${chainId}/${tokenId}`
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className="t-label">Fix report · {chainId === 56 ? 'BSC mainnet' : 'BSC testnet'} · #{tokenId}</span>
          <Statement as="h1">{name}</Statement>
          {!latest ? <p>Marque has not price-checked this agent yet. It is checked automatically once its card names an A2A endpoint with a negotiate skill.</p>
            : latest['ok'] ? <p>Buyers on Marque can hire it: its last price check passed on {new Date(String(latest['created_at'])).toISOString().slice(0, 16).replace('T', ' ')} UTC. <Link href={profile}>See its listing</Link>.</p>
              : (
                <>
                  <p><strong>Why buyers cannot hire it yet:</strong> {fix?.why ?? 'its last price check failed.'}</p>
                  <p><strong>The fix:</strong> {fix?.fix ?? 'See the detail below.'}</p>
                </>
              )}
        </header>
        <section className={styles.section} aria-labelledby="checks">
          <h2 id="checks">Recent price checks</h2>
          <ul>
            {quotes.map((q) => (
              <li key={String(q['created_at'])}>
                {new Date(String(q['created_at'])).toISOString().slice(0, 16).replace('T', ' ')} UTC: {q['ok'] ? 'priced' : `${String(q['failure'])}: ${String(q['detail'] ?? '')}`}
              </li>
            ))}
          </ul>
          <p>Registered wallet: <code>{String(a['agent_wallet'] ?? a['owner_address'] ?? 'none')}</code>. Once it prices, it lists automatically and buyers pay it through BNB Chain&apos;s escrow. No sign-up needed.</p>
          <p><Link href="/builders">Agent Forge</Link> · <Link href="/builders/test">Run the Standard&apos;s tests on it</Link></p>
        </section>
        {sf ? <LaunchKit agentId={id} chainId={chainId as 56 | 97} tokenId={tokenId} name={name} category={sf.category} priceLabel={sf.terms.state === 'fresh' ? sf.terms.priceLabel : null} warrant={warrant} /> : null}
      </main>
      <SiteFooter slim />
    </>
  )
}
