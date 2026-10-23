import { CAMPAIGN } from '@marque/commerce/rules'

export const dynamic = 'force-static'

/** RFC 5545 folding: lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut--
    out.push(rest.slice(0, cut))
    rest = ` ${rest.slice(cut)}`
  }
  out.push(rest)
  return out.join('\r\n')
}
const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/**
 * GET /quest/calendar.ics (SPEC-ADOPTION 5, rung 1a): one event at the Set and Earn close with
 * alarms 7 days, 2 days, 1 day and 3 hours before. Nothing is kept: it is the same file for
 * everyone.
 */
export function GET() {
  const end = stamp(new Date(CAMPAIGN.end).toISOString())
  const endPlus = stamp(new Date(Date.parse(CAMPAIGN.end) + 30 * 60_000).toISOString())
  const alarm = (trigger: string, words: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:Set and Earn closes in ${words}`, 'END:VALARM']
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Marque//Set and Earn reminder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:set-and-earn-close-2026@marque.trade',
    'DTSTAMP:20261023T000000Z',
    `DTSTART:${end}`,
    `DTEND:${endPlus}`,
    'SUMMARY:Set and Earn closes (BNB Chain)',
    'DESCRIPTION:BNB Chain Set and Earn closes at 12:00 UTC. Hires count from their hire event on chain\\, so fund them before then. Check your progress: https://marque.trade/quest',
    'URL:https://marque.trade/quest',
    'TRANSP:TRANSPARENT',
    ...alarm('-P7D', '7 days'), ...alarm('-P2D', '2 days'), ...alarm('-P1D', '1 day'), ...alarm('-PT3H', '3 hours'),
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="set-and-earn.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
