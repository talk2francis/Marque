import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getAddress, isAddress } from 'viem'
import { teamWallets } from '@marque/commerce'
import { isCharterChain } from '@marque/charters'
import { SiteHeader, SiteFooter } from '../../../_components/SiteHeader'
import { guardPageVisible, PREVIEW_COOKIE } from '../../../../lib/charters-access'
import { guardDetail } from '../../../../lib/guards'
import { charterV2Detail } from '../../../../lib/charters-v2'
import { CharterView } from '../../_components/CharterView'
import { CharterV2View } from '../../_components/CharterV2View'
import { KIND_NAMES } from '@marque/charters'
import styles from '../../charters.module.css'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ chainId: string; guard: string }> }

async function load({ params }: Params) {
  const { chainId, guard } = await params
  const c = Number(chainId)
  if (!isCharterChain(c) || !isAddress(guard)) return null
  const cookie = (await cookies()).get(PREVIEW_COOKIE)?.value
  // v2 charters (any kind) first, then a v1 Loan Guard. Reachable whenever the owner is outside the team list, so an
  // owner can always find End (AGENTS.md C6).
  const v2 = await charterV2Detail(c, getAddress(guard)).catch(() => null)
  if (v2) return guardPageVisible(cookie, v2.charter.owner, teamWallets()) ? { v2, v1: null } : null
  const d = await guardDetail(c, getAddress(guard)).catch(() => null)
  if (!d) return null
  if (!guardPageVisible(cookie, d.guard.owner, teamWallets())) return null
  return { v2: null, v1: d }
}

export async function generateMetadata(p: Params) {
  const r = await load(p)
  if (!r) return { title: 'Charter' }
  if (r.v2) return { title: `${KIND_NAMES[r.v2.charter.kind]} ${r.v2.charter.address.slice(0, 6)}…${r.v2.charter.address.slice(-4)}`, description: `A ${KIND_NAMES[r.v2.charter.kind]} charter on ${r.v2.charter.chainId === 56 ? 'BNB Smart Chain' : 'BSC testnet'}. Every action is on chain.`, robots: { index: false } }
  const d = r.v1!
  const t = (v: string) => (Number(BigInt(v) / 10n ** 14n) / 10_000).toFixed(2)
  return {
    title: `Loan Guard ${d.guard.address.slice(0, 6)}…${d.guard.address.slice(-4)}`,
    description: `Guards a ${d.guard.symbol} loan on Venus. Acts below ${t(d.guard.trigger)}, lifts back to ${t(d.guard.target)}. Every action is on chain.`,
    robots: { index: false },
  }
}

/** /charters/{chainId}/{guard}: the public page of one Loan Guard (03_EXPERIENCE section 2). */
export default async function CharterPage(p: Params) {
  const r = await load(p)
  if (!r) notFound()
  if (r.v2) {
    const team2 = teamWallets().includes(r.v2.charter.owner.toLowerCase())
    return (
      <>
        <SiteHeader />
        <main className={styles.page}>
          <nav className={styles.crumbs} aria-label="Breadcrumb"><a href="/charters">Charters</a><span aria-hidden="true">/</span><span aria-current="page">{KIND_NAMES[r.v2.charter.kind]}</span></nav>
          <CharterV2View initial={JSON.parse(JSON.stringify(r.v2))} teamOwner={team2} />
        </main>
        <SiteFooter slim />
      </>
    )
  }
  const d = r.v1!
  const team = teamWallets().includes(d.guard.owner.toLowerCase())
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <nav className={styles.crumbs} aria-label="Breadcrumb"><a href="/charters">Charters</a><span aria-hidden="true">/</span><span aria-current="page">Loan Guard</span></nav>
        <CharterView initial={JSON.parse(JSON.stringify(d))} teamOwner={team} />
      </main>
      <SiteFooter slim />
    </>
  )
}
