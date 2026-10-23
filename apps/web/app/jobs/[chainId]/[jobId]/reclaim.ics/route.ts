import { agenticCommerceAbi, chainClient, isSupportedChain, network } from '@marque/commerce'

export const dynamic = 'force-dynamic'

/** RFC 5545: fold lines longer than 75 octets. */
const fold = (line: string) => { const out: string[] = []; let rest = line; while (Buffer.byteLength(rest) > 75) { out.push(rest.slice(0, 74)); rest = ` ${rest.slice(74)}` } out.push(rest); return out.join('\r\n') }
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** GET /jobs/{chain}/{job}/reclaim.ics: one event when an undelivered job's refund opens, read from chain. */
export async function GET(_req: Request, { params }: { params: Promise<{ chainId: string; jobId: string }> }) {
  const { chainId: c, jobId } = await params
  const cid = Number(c)
  if (!isSupportedChain(cid) || !/^\d{1,12}$/.test(jobId)) return new Response('Not found', { status: 404 })
  const job = await chainClient(cid).readContract({ address: network(cid).commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [BigInt(jobId)] }).catch(() => null) as null | { expiredAt: bigint }
  if (!job) return new Response('Job not found', { status: 404 })
  const at = Number(job.expiredAt) * 1000
  const url = `https://marque.trade/jobs/${cid}/${jobId}`
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Marque//Reclaim reminder//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:reclaim-${cid}-${jobId}@marque.trade`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(at)}`, `DTEND:${stamp(at + 30 * 60_000)}`,
    `SUMMARY:Reclaim job #${jobId} on ${cid === 56 ? 'BSC mainnet' : 'BSC testnet'}`,
    `DESCRIPTION:The agent did not deliver. From now the wallet that paid can reclaim the full amount in the Job Room: ${url}`,
    `URL:${url}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', `DESCRIPTION:Reclaim job #${jobId}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ]
  return new Response(lines.map(fold).join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="reclaim-${jobId}.ics"`, 'Cache-Control': 'public, max-age=300' } })
}
