async function bodyBytes(response, maximum) {
  const reader = response.body.getReader()
  let size = 0
  const chunks = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new Error('previous asset response exceeds its size limit')
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel() }
  return Buffer.concat(chunks)
}

/** Verify the files needed by a page loaded before the traffic switch. */
export async function verifyPreviousAssets(base, previous) {
  const page = await fetch(new URL('/', previous), { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!page.ok) throw new Error('previous release page is unavailable')
  const html = (await bodyBytes(page, 2 * 1024 * 1024)).toString('utf8')
  const paths = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map(match => match[1]))]
  if (!paths.length) throw new Error('previous release page has no static assets')
  for (const path of paths) {
    const url = new URL(path, base)
    if (url.origin !== new URL(base).origin || !url.pathname.startsWith('/_next/static/')) throw new Error('invalid previous asset path')
    const asset = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) })
    const type = asset.headers.get('content-type') ?? ''
    if (!asset.ok || type.includes('text/html') ||
      (url.pathname.endsWith('.js') && !/javascript|ecmascript/.test(type)) ||
      (url.pathname.endsWith('.css') && !type.includes('text/css'))) throw new Error(`previous asset unavailable: ${path}`)
    if (!(await bodyBytes(asset, 8 * 1024 * 1024)).length) throw new Error(`previous asset empty: ${path}`)
  }
  return paths.length
}
