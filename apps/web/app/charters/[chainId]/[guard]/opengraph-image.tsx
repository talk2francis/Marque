import { ImageResponse } from 'next/og'
import { getAddress, isAddress } from 'viem'
import { teamWallets } from '@marque/commerce'
import { isCharterChain } from '@marque/charters'
import { guardDetail } from '../../../../lib/guards'
import { guardPageVisible } from '../../../../lib/charters-access'

/**
 * A charter's share card, from the charter itself: its sentence, its status and what it has done. Same visibility
 * as the page (a crawler carries no preview cookie), so a team test charter makes no card before launch. No web
 * font is fetched; the system stack renders.
 */
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'A Marque Loan Guard charter: what it guards, when it acts, and what it has done.'

const DECK = '#141413', INK = '#EEEBE4', SOFT = '#B7B3AA', MUTED = '#8C8880', BRASS = '#C4AC7C', MOSS = '#86B596', AMBER = '#D9963A'
const h = (wad: string) => (Number(BigInt(wad) / 10n ** 14n) / 10_000).toFixed(2)

export default async function Image({ params }: { params: Promise<{ chainId: string; guard: string }> }) {
  const { chainId, guard } = await params
  const c = Number(chainId)
  const d = isCharterChain(c) && isAddress(guard) ? await guardDetail(c, getAddress(guard)).catch(() => null) : null
  if (!d || !guardPageVisible(null, d.guard.owner, teamWallets())) {
    return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: DECK, color: INK, fontSize: 44 }}>Marque · Charters</div>, size)
  }
  const g = d.guard
  const status = g.status === 'armed' ? 'Armed' : g.status === 'ended' ? 'Ended' : 'Expired'
  const tone = g.status === 'armed' ? MOSS : MUTED
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: DECK, color: INK, fontFamily: 'Georgia, serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'system-ui, sans-serif', fontSize: 26, color: SOFT }}>
          <span style={{ color: BRASS, fontWeight: 600 }}>Marque</span><span>·</span><span>Loan Guard</span><span>·</span><span>{c === 56 ? 'BNB Smart Chain' : 'BSC testnet'}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, color: tone, border: `2px solid ${tone}`, borderRadius: 999, padding: '6px 18px' }}>{status}</span>
        </div>
        <div style={{ display: 'flex', fontSize: 62, lineHeight: 1.12, letterSpacing: -1 }}>
          Guards a {g.symbol} loan on Venus. Acts below {h(g.trigger)}, lifts back to {h(g.target)}.
        </div>
        <div style={{ display: 'flex', gap: 56, fontFamily: 'system-ui, sans-serif', fontSize: 26, color: SOFT }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}><b style={{ color: INK, fontSize: 40 }}>{g.acts}</b>times it acted</span>
          <span style={{ display: 'flex', flexDirection: 'column' }}><b style={{ color: g.status === 'armed' ? AMBER : INK, fontSize: 40 }}>{d.live.health ? h(d.live.health) : 'n/a'}</b>health now</span>
          <span style={{ display: 'flex', flexDirection: 'column' }}><b style={{ color: INK, fontSize: 40 }}>{new Date(g.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</b>ends</span>
          <span style={{ marginLeft: 'auto', alignSelf: 'flex-end', color: MUTED }}>Your money stays in your wallet. One destination: your own loan.</span>
        </div>
      </div>
    ),
    size,
  )
}
