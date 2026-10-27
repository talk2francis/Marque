import { chaptersVtt } from '../../../lib/film'

/** The film's chapters as WebVTT, for native players and full screen (lib/film.ts is the source). */
export const dynamic = 'force-static'

export function GET() {
  return new Response(chaptersVtt(), {
    headers: { 'content-type': 'text/vtt; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
