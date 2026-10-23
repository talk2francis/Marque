import { BRAND } from '@marque/ui'
import { storefrontByToken } from '../../../../lib/storefront'

export const dynamic = 'force-dynamic'

const TEST: Record<string, string> = { yield: 'MCS-YIELD-1', grid: 'MCS-GRID-1', rebalancing: 'MCS-REB-1', health_factor: 'MCS-HF-1' }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Verdana 11 px averages close to 6.8 px a character; the same metric shields-style badges use.
const width = (s: string) => Math.round(s.length * 6.8 + 16)

const THEMES = {
  light: { bg: '#F7F7F3', ink: '#15160F', soft: '#5C5E52', rule: '#D4D4CB', brass: '#8A6A1F', moss: '#2E7351' },
  dark: { bg: '#1B1E15', ink: '#E8E9E0', soft: '#A9AB9E', rule: '#2C3023', brass: '#D9AE45', moss: '#5FB487' },
}

/**
 * GET /badge/{chainId}/{tokenId}.svg[?theme=dark] (SPEC-BUILDERS 7): a live README badge built only from
 * measured facts (the current quote and the agent's own category test). Cached 5 minutes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ chainId: string; file: string }> }) {
  const { chainId, file } = await params
  const m = file.match(/^(\d{1,12})\.svg$/)
  const c = chainId === '97' ? 97 : chainId === '56' ? 56 : null
  if (!m || !c) return new Response('Not found', { status: 404 })
  const t = new URL(req.url).searchParams.get('theme') === 'dark' ? THEMES.dark : THEMES.light
  const d = await storefrontByToken(m[1]!, c).catch(() => null)
  const parts: Array<{ text: string; color: string }> = [{ text: BRAND.name, color: t.ink }]
  if (!d) parts.push({ text: 'Not indexed yet', color: t.soft })
  else {
    parts.push(d.terms.state === 'fresh' && d.terms.priceLabel ? { text: `Hireable ${d.terms.priceLabel}`, color: t.moss } : { text: 'Not hireable now', color: t.soft })
    const own = d.category ? d.tests.filter((x) => x.testId === TEST[d.category!]) : []
    const latest = own[0]
    const fresh = latest?.pass && latest.ranAt && Date.now() - Date.parse(latest.ranAt) <= 72 * 3_600_000
    parts.push(fresh ? { text: `Warranted ${latest!.testId.replace('MCS-', '')}`, color: t.brass } : latest ? { text: `Tested ${latest.testId.replace('MCS-', '')}`, color: t.soft } : { text: 'Untested', color: t.soft })
    if (c === 97) parts.push({ text: 'testnet', color: t.soft })
  }
  let x = 0
  const cells = parts.map((p, i) => {
    const w = width(p.text)
    const cell = `${i ? `<line x1="${x}" y1="4" x2="${x}" y2="16" stroke="${t.rule}"/>` : ''}<text x="${x + w / 2}" y="14" fill="${p.color}" text-anchor="middle"${i === 0 ? ' font-weight="700"' : ''}>${esc(p.text)}</text>`
    x += w
    return cell
  }).join('')
  const label = parts.map((p) => p.text).join(', ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="20" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><rect x="0.5" y="0.5" width="${x - 1}" height="19" rx="3" fill="${t.bg}" stroke="${t.rule}"/><g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">${cells}</g></svg>`
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300', 'Access-Control-Allow-Origin': '*' } })
}
