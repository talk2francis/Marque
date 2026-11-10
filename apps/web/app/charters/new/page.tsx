import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { isAddress } from 'viem'
import { CHARTER_CHAINS, V2, isCharterChain, type CharterChainId, type CharterKind } from '@marque/charters'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { chartersVisible, PREVIEW_COOKIE } from '../../../lib/charters-access'
import { Builder } from '../_components/Builder'
import { YieldBuilder } from '../_components/YieldBuilder'
import { GridBuilder } from '../_components/GridBuilder'
import { RangeBuilder } from '../_components/RangeBuilder'
import styles from '../charters.module.css'
import b from '../_components/builder.module.css'

export const dynamic = 'force-dynamic'

const KINDS: Array<{ kind: CharterKind; name: string; agent: string; eyebrow: string; title: [string, string]; lede: string }> = [
  { kind: 'loan', name: 'Loan Guard', agent: 'Keel', eyebrow: 'Guard this loan', title: ['Draw the line.', 'We’ll hold it.'], lede: 'Drag the two marks. Everything follows them, in plain words and in BNB prices.' },
  { kind: 'yield', name: 'Yield Sweep', agent: 'Sluicegate', eyebrow: 'Sweep idle money', title: ['Keep enough.', 'Put the rest to work.'], lede: 'Set the band your wallet should stay in. The excess goes to Venus in your name and comes back when you need it.' },
  { kind: 'grid', name: 'Grid Band', agent: 'Lattice', eyebrow: 'Trade this band', title: ['Buy lower.', 'Sell one step higher.'], lede: 'Choose the price band and the order size. Every level is a promise in code: a completed round trip never returns less than it spent.' },
  { kind: 'range', name: 'Range Keeper', agent: 'Bound', eyebrow: 'Keep this range', title: ['Stay in range,', 'without watching.'], lede: 'When the price leaves your range and stays out, your keeper moves it back, same width, inside your limits.' },
]
const ALIAS: Record<string, CharterKind> = { loan: 'loan', 'loan-guard': 'loan', yield: 'yield', 'yield-sweep': 'yield', grid: 'grid', 'grid-band': 'grid', range: 'range', 'range-keeper': 'range' }

/** Read-only demos per kind (AGENTS.md invariant 2): an address that holds that kind of position on each network. */
const DEMO: Record<CharterKind, Record<CharterChainId, string>> = {
  loan: { 56: process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf', 97: process.env['CHARTERS_DEMO_97'] ?? '0x0cC5DB909cEcE1856d1896d633d32Bd305ce26c2' },
  yield: { 56: process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf', 97: '0xdEee4B1Ef2da1370e8b604844E01e0E485eEBf4A' },
  grid: { 56: process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf', 97: '0xdEee4B1Ef2da1370e8b604844E01e0E485eEBf4A' },
  range: { 56: process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf', 97: '0x57668f86eaDC90945204692436DC620a596935C7' },
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const k = ALIAS[String((await searchParams)['kind'] ?? 'loan')] ?? 'loan'
  const meta = KINDS.find((x) => x.kind === k)!
  return { title: meta.name, description: meta.lede, robots: { index: false } }
}

/** /charters/new?kind=loan|yield|grid|range&chain=56&account=0x.. (11_EXPERIENCE). Behind CHARTERS_PUBLIC until launch. */
export default async function NewCharterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!chartersVisible((await cookies()).get(PREVIEW_COOKIE)?.value)) notFound()
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const kind = ALIAS[one('kind') ?? 'loan'] ?? 'loan'
  const meta = KINDS.find((x) => x.kind === kind)!
  const asked = Number(one('chain'))
  const live56 = kind === 'loan' ? Boolean(V2[56].loanFactory ?? CHARTER_CHAINS[56].factory) : Boolean({ yield: V2[56].yieldFactory, grid: V2[56].gridFactory, range: V2[56].rangeFactory }[kind as 'yield' | 'grid' | 'range'])
  const chain: CharterChainId = isCharterChain(asked) ? asked : live56 ? 56 : 97
  const account = one('account')
  const acc = account && isAddress(account) ? account : null
  const market = one('market')
  const q = (k: CharterKind) => `/charters/new?kind=${k}&chain=${chain}${acc ? `&account=${acc}` : ''}`
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <div>
            <span className={styles.eyebrow}>{meta.eyebrow}</span>
            <h1 className={styles.title}>{meta.title[0]} <em>{meta.title[1]}</em></h1>
          </div>
          <p className={styles.lede}>{meta.lede}</p>
        </header>
        <nav className={b.kindTabs} role="tablist" aria-label="Kind of charter">
          {KINDS.map((k) => (
            <Link key={k.kind} href={q(k.kind)} role="tab" aria-selected={k.kind === kind} aria-controls="builder" replace scroll={false}>{k.name} <small>{k.agent}</small></Link>
          ))}
        </nav>
        <div id="builder" role="tabpanel" aria-label={meta.name}>
          {kind === 'loan' ? <Builder initialChain={chain} initialAccount={acc} initialMarket={market && /^[\w]{2,12}$|^0x[0-9a-fA-F]{40}$/.test(market) ? market : null} demo={DEMO.loan} />
            : kind === 'yield' ? <YieldBuilder key={`y${chain}`} initialChain={chain} initialAccount={acc} demo={DEMO.yield} />
              : kind === 'grid' ? <GridBuilder key={`g${chain}`} initialChain={chain} initialAccount={acc} demo={DEMO.grid} />
                : <RangeBuilder key={`r${chain}`} initialChain={chain} initialAccount={acc} initialPosition={/^\d{1,78}$/.test(one('position') ?? '') ? one('position') : null} demo={DEMO.range} />}
        </div>
      </main>
      <SiteFooter slim />
    </>
  )
}
