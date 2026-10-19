import { setTimeout as sleep } from 'node:timers/promises'

// These four data-backed routes are pre-rendered with a 30-second ISR window.
// A build can use an isolated fixture. Never accept that cached HTML for traffic.
const ROUTES = ['/', '/protocol', '/register', '/quest']
export async function warmCandidateProjections(base, options = {}) {
  const fetchPage = options.fetchPage ?? (async (path) => {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) })
    const html = await response.text()
    if (!response.ok || !html.includes('</html>')) throw new Error(`incomplete projection ${path}: ${response.status}`)
    return { cache: response.headers.get('x-nextjs-cache'), html }
  })
  const wait = options.wait ?? sleep
  const now = options.now ?? Date.now
  const startedAt = now()
  const initial = []
  for (const route of ROUTES) initial.push({ route, ...(await fetchPage(route)) })
  // Use the real ISR interval. Do not rewrite cache files or forge their age.
  await wait(31000)
  const deadline = now() + 90000
  const records = []
  for (const route of ROUTES) {
    for (;;) {
      const page = await fetchPage(route)
      const stamp = route === '/' ? /aria-label="Quote snapshot at ([^"]+)"/.exec(page.html)?.[1] : null
      const currentHome = route !== '/' || (stamp && Date.parse(stamp) >= startedAt - 1000) || (!stamp && page.html.includes('Live category counts are unavailable'))
      if (['HIT', 'REVALIDATED', 'MISS'].includes(page.cache) && currentHome) {
        records.push({ route, cache: page.cache, snapshotAt: stamp ?? null })
        break
      }
      if (now() >= deadline) throw new Error(`projection did not refresh from runtime data: ${route}`)
      await wait(1000)
    }
  }
  return { startedAt: new Date(startedAt).toISOString(), verifiedAt: new Date(now()).toISOString(), initialCache: initial.map(({ route, cache }) => ({ route, cache })), records }
}
