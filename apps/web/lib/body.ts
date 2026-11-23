/**
 * Read a JSON request body with a hard size limit (23 Nov 2026). `request.json()` buffers the whole body before any
 * schema can check its size; this refuses by Content-Length first, then stops reading as soon as the limit is passed.
 * Caddy also refuses bodies over 4 MB site-wide; this is the per-route limit behind it.
 */
export async function readJsonCapped(request: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge: boolean }> {
  const declared = Number(request.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, tooLarge: true }
  const reader = request.body?.getReader()
  if (!reader) return { ok: false, tooLarge: false }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) { await reader.cancel().catch(() => undefined); return { ok: false, tooLarge: true } }
    chunks.push(value)
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { ok: false, tooLarge: false }
  }
}
