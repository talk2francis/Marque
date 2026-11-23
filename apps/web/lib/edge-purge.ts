import 'server-only'

/**
 * Ask the local edge cache (ops/edge, 127.0.0.1 only; its admin calls are refused through Caddy) to drop stored copies
 * of these paths, so a change is served at once instead of after the entry's freshness window. Best effort: a missing
 * or slow edge never fails the user's change.
 */
export async function purgeEdge(paths: readonly string[]): Promise<void> {
  const port = process.env['EDGE_PORT'] ?? '3190'
  await Promise.all(paths.map((p) => fetch(`http://127.0.0.1:${port}/__edge/purge?path=${encodeURIComponent(p)}`, { method: 'POST', signal: AbortSignal.timeout(800) })
    .then((r) => r.arrayBuffer()).catch(() => undefined)))
}
