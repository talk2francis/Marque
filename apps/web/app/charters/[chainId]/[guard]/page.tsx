import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getAddress, isAddress } from 'viem'
import { teamWallets } from '@marque/commerce'
import { isCharterChain } from '@marque/charters'
import { SiteHeader, SiteFooter } from '../../../_components/SiteHeader'
import { guardPageVisible, PREVIEW_COOKIE } from '../../../../lib/charters-access'
import { guardDetail } from '../../../../lib/guards'
import { CharterView } from '../../_components/CharterView'
import styles from '../../charters.module.css'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ chainId: string; guard: string }> }

async function load({ params }: Params) {
  const { chainId, guard } = await params
  const c = Number(chainId)
  if (!isCharterChain(c) || !isAddress(guard)) return null
  const d = await guardDetail(c, getAddress(guard)).catch(() => null)
  if (!d) return null
  // Reachable whenever the owner is outside the team list, so an owner can always find End (AGENTS.md C5).
  if (!guardPageVisible((await cookies()).get(PREVIEW_COOKIE)?.value, d.guard.owner, teamWallets())) return null
  return d
}

export async function generateMetadata(p: Params) {
  const d = await load(p)
  if (!d) return { title: 'Charter' }
  const t = (v: string) => (Number(BigInt(v) / 10n ** 14n) / 10_000).toFixed(2)
  return {
    title: `Loan Guard ${d.guard.address.slice(0, 6)}…${d.guard.address.slice(-4)}`,
    description: `Guards a ${d.guard.symbol} loan on Venus. Acts below ${t(d.guard.trigger)}, lifts back to ${t(d.guard.target)}. Every action is on chain.`,
    robots: { index: false },
  }
}

/** /charters/{chainId}/{guard}: the public page of one Loan Guard (03_EXPERIENCE section 2). */
export default async function CharterPage(p: Params) {
  const d = await load(p)
  if (!d) notFound()
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
