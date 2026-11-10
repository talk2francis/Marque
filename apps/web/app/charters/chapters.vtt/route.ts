import { chartersChaptersVtt } from '../../../lib/film-charters'
export const dynamic = 'force-static'
export function GET() {
  return new Response(chartersChaptersVtt(), { headers: { 'content-type': 'text/vtt; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
