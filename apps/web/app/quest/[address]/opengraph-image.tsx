import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { campaignClock } from '@marque/commerce/rules'
import { questProjection, QUEST_ADDRESS } from '../../../lib/quest-api'

/**
 * The share card for /quest/{address} (SPEC-ADOPTION 6): Night palette, the wordmark, Instrument
 * Serif for the title, the two tracks and the block it was read at. Every number comes from the
 * same cached projection as the page; when it cannot be read, the card says so instead.
 */
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Set and Earn progress on Marque'

const NIGHT = '#141412'
const INK = '#EEEBE4'
const SOFT = '#9C998F'
const HAIR = '#2B2A26'
const BRASS = '#C79A4B'
const MOSS = '#7FA88A'

async function serif(): Promise<ArrayBuffer | null> {
  for (const p of [join(process.cwd(), 'assets/fonts/InstrumentSerif-Regular.ttf'), join(process.cwd(), 'apps/web/assets/fonts/InstrumentSerif-Regular.ttf')]) {
    try { const b = await readFile(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer } catch { /* next path */ }
  }
  return null
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const font = await serif()
  const valid = QUEST_ADDRESS.test(address)
  const p = valid ? await questProjection(address).catch(() => null) : null
  const q = p?.value ?? null
  const agents = q ? Math.min(q.hire.distinctAgents, 3) : null
  const build = q ? (q.build.agents[0]?.observed ?? 0) : null
  const clock = campaignClock(Date.now())
  const left = clock.closed ? 'Set and Earn has closed' : `${clock.days} day${clock.days === 1 ? '' : 's'} left`
  const block = q ? (q.blocks?.[56] ?? null) : null
  const metHire = q?.hire.status === 'met' && !q.excluded.team
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: NIGHT, color: INK, padding: '72px 88px', fontFamily: 'Georgia, serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="52" height="52" viewBox="0 0 100 100" fill={INK}>
            <path d="M50 43C46 36 39 30 32 30 27 30 25 33 25 39.5L25 58C25 63 24.5 68 28.5 67.5L50 43Z" />
            <path d="M50 43C54 36 61 30 68 30 73 30 75 33 75 39.5L75 58C75 63 75.5 68 71.5 67.5L50 43Z" />
          </svg>
          <div style={{ display: 'flex', fontSize: 38 }}>Marque</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 76, lineHeight: 1.05, fontFamily: font ? 'Instrument Serif' : 'Georgia, serif' }}>Set and Earn on Marque</div>
          <div style={{ display: 'flex', fontSize: 34, color: SOFT, marginTop: 18, fontFamily: 'ui-monospace, Menlo, monospace' }}>{valid ? short(address) : 'Check any wallet'}</div>
          <div style={{ display: 'flex', height: 2, width: 160, background: BRASS, margin: '34px 0 30px' }} />
          {q ? (
            <div style={{ display: 'flex', gap: 72, fontSize: 40 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}><span style={{ color: SOFT, fontSize: 28 }}>Hire</span><span style={{ color: metHire ? MOSS : INK }}>{`${agents} of 3 agents`}</span></div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}><span style={{ color: SOFT, fontSize: 28 }}>Build</span><span style={{ color: build === 6 && !q.excluded.team ? MOSS : INK }}>{`${build} of 6 criteria`}</span></div>
            </div>
          ) : (
            <div style={{ display: 'flex', fontSize: 34, color: SOFT }}>Hires on every shortlisted marketplace, and the six build criteria, read from chain.</div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${HAIR}`, paddingTop: 22, fontSize: 24, color: SOFT }}>
          <span style={{ display: 'flex' }}>{q?.excluded.team ? 'Team wallet: shown, never counted' : `${left}${block ? ` · checked on chain at block ${block.toLocaleString('en-US')}` : ''}`}</span>
          <span style={{ display: 'flex' }}>marque.trade/quest</span>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: 'Instrument Serif', data: font, style: 'normal', weight: 400 }] : [] },
  )
}
