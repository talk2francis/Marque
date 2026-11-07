import { setTimeout as sleep } from 'node:timers/promises'

/** Retained releases may predate /api/ready; still verify their complete liveness body and release. */
export async function verifyLegacyRelease(base, options = {}) {
  const expected = options.release ?? process.env.EXPECTED_RELEASE_SHA
  if (!/^[a-f0-9]{40}$/.test(expected ?? '')) throw Error('legacy release metadata required')
  const read = options.read ?? (async () => {
    const r = await fetch(base + '/api/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    return { status: r.status, body: await r.json() }
  })
  const { status, body } = await read()
  if (status !== 200 || body?.ok !== true || body.release !== expected) throw Error('legacy release mismatch')
  return { legacy: true, release: expected }
}

/** Check each cluster worker using fresh connections rather than one sticky socket. */
export async function verifyReadiness(base, options = {}) {
  const instances = options.instances ?? 2
  if (!Number.isInteger(instances) || instances < 1 || instances > 16) throw Error('invalid worker count')
  const expected = options.release ?? process.env.EXPECTED_RELEASE_SHA
  const now = options.now ?? Date.now, wait = options.wait ?? sleep
  const deadline = now() + (options.timeoutMs ?? 120000)
  const read = options.read ?? (async () => {
    const r = await fetch(base + '/api/ready', { headers: { Connection: 'close' }, cache: 'no-store', signal: AbortSignal.timeout(30000) })
    const body = await r.json()
    return { status: r.status, body }
  })
  const workers = new Set()
  while (now() < deadline) {
    try {
      const { status, body } = await read()
      if (status === 200 && body.ready === true && /^[a-f0-9-]{36}$/.test(body.instance)) {
        if (expected && body.release !== expected) throw Error('readiness release mismatch')
        workers.add(body.instance)
        if (workers.size >= instances) return { workers: workers.size, release: expected ?? null, verifiedAt: new Date(now()).toISOString() }
      }
    } catch (error) { if (error.message === 'readiness release mismatch') throw error }
    await wait(250)
  }
  throw Error(`readiness failed: ${workers.size} of ${instances} workers initialized`)
}
