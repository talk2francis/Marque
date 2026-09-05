import { ImageResponse } from 'next/og'
import { readReceipt } from '../../../lib/runs'

/**
 * The receipt's share image, generated on the server.
 *
 * Rendered from the receipt itself, so a shared card cannot say something the
 * page does not. It carries the four verdicts and the leaf and nothing else —
 * an OG image is read at a glance, and the glance should land on whether the
 * run passed and what hash fixes it.
 *
 * No web font is fetched: the system stack renders, the image is 1200x630, and
 * a build that cannot reach a font CDN still produces a card.
 */

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'A Marque receipt: what an agent was hired to do, what it was permitted to do, and what it produced.'

const PAPER = '#EDEDE7'
const INK = '#15160F'
const SOFT = '#5C5E52'
const RULE = '#D4D4CB'
const BRASS = '#846621'
const HOLDS = '#2E7351'
const BREACH = '#A83A2C'
const WATCH = '#B8721A'

interface Body {
  task: { kind: string; subject: string }
  commercial: { agentId: string; settled: boolean }
  execution: { ok: boolean; blockNumber: string; txHashes: string[]; failureReason: string | null }
  authority: { charterId: string | null; allowlist: string[] }
  quality: { testId: string | null; pass: boolean | null }
}

export default async function Image({ params }: { params: { id: string } }) {
  const row = await readReceipt(params.id).catch(() => null)

  if (!row) {
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: PAPER, color: INK, fontSize: 44,
        }}>
          Marque · receipt not found
        </div>
      ),
      size,
    )
  }

  const body = row.body as unknown as Body
  const proofs: Array<{ name: string; verdict: string; colour: string }> = [
    {
      name: 'Commercial',
      verdict: body.commercial.settled ? 'Settled' : 'Not settled',
      colour: body.commercial.settled ? HOLDS : SOFT,
    },
    {
      name: 'Execution',
      verdict: body.execution.ok ? 'Completed' : (body.execution.failureReason ?? 'Failed'),
      colour: body.execution.ok ? HOLDS : BREACH,
    },
    {
      name: 'Authority',
      verdict: body.authority.charterId
        ? `${body.authority.allowlist.length} contract${body.authority.allowlist.length === 1 ? '' : 's'}`
        : 'Read-only',
      colour: SOFT,
    },
    {
      name: 'Quality',
      verdict: body.quality.pass === null ? 'Not graded' : body.quality.pass ? `Passed ${body.quality.testId}` : `Failed ${body.quality.testId}`,
      colour: body.quality.pass === null ? SOFT : body.quality.pass ? HOLDS : WATCH,
    },
  ]

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: PAPER, color: INK, padding: 64,
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `3px solid ${INK}`, paddingBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 26, color: SOFT, letterSpacing: 1 }}>Marque</div>
            <div style={{ fontSize: 62, marginTop: 6 }}>Receipt</div>
          </div>
          <div style={{ fontSize: 26, color: SOFT, textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
            <span>{body.task.kind.replace('_', ' ')}</span>
            <span>block {body.execution.blockNumber}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 36, flex: 1, alignContent: 'flex-start' }}>
          {proofs.map((p) => (
            <div key={p.name} style={{
              width: '50%', height: 118, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: '0 24px', borderLeft: `5px solid ${p.colour}`, marginBottom: 16,
            }}>
              <span style={{ fontSize: 24, color: SOFT }}>{p.name}</span>
              <span style={{ fontSize: 36, marginTop: 6 }}>{p.verdict}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, borderTop: `1px solid ${RULE}`, paddingTop: 22 }}>
          <span style={{ fontSize: 22, color: SOFT }}>
            {row.anchorTxHash ? 'Anchored on BNB Smart Chain' : 'Not anchored on chain'}
          </span>
          <span style={{ fontSize: 27, color: BRASS, marginTop: 6 }}>{row.hash}</span>
        </div>
      </div>
    ),
    size,
  )
}
