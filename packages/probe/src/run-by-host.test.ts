import { describe, expect, it } from 'vitest'
import { runByHost, hostOfUrl } from './worker.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('runByHost', () => {
  it('keeps input order and never exceeds the per-host or the overall limit', async () => {
    const items = Array.from({ length: 60 }, (_v, i) => `https://h${i % 5}.example/agents/${i}/card`)
    let live = 0, peak = 0
    const perHost = new Map<string, number>()
    let hostPeak = 0
    const out = await runByHost(items, hostOfUrl, { concurrency: 8, perHost: 3, perHostRps: 0 }, async (url) => {
      const host = hostOfUrl(url)
      live++; peak = Math.max(peak, live)
      perHost.set(host, (perHost.get(host) ?? 0) + 1); hostPeak = Math.max(hostPeak, perHost.get(host)!)
      await sleep(5)
      perHost.set(host, perHost.get(host)! - 1); live--
      return url
    })
    expect(out).toEqual(items)
    expect(peak).toBeLessThanOrEqual(8)
    expect(hostPeak).toBeLessThanOrEqual(3)
  })

  it('does not let one slow platform hold up every other host', async () => {
    // 40 services on one slow host listed first, then 20 on fast hosts: the fast ones must not wait for the slow line.
    const items = [...Array.from({ length: 40 }, (_v, i) => `https://slow.example/${i}`), ...Array.from({ length: 20 }, (_v, i) => `https://fast${i}.example/card`)]
    const started = Date.now()
    let fastDoneAt = 0
    await runByHost(items, hostOfUrl, { concurrency: 32, perHost: 3, perHostRps: 0 }, async (url) => {
      if (url.includes('slow')) { await sleep(40); return }
      await sleep(5)
      fastDoneAt = Date.now() - started
    })
    expect(fastDoneAt).toBeLessThan(150)
    expect(Date.now() - started).toBeGreaterThan(400)
  })

  it('spaces request starts on a host', async () => {
    const starts: number[] = []
    const t0 = Date.now()
    await runByHost(Array.from({ length: 6 }, (_v, i) => `https://one.example/${i}`), hostOfUrl, { concurrency: 32, perHost: 3, perHostRps: 20 }, async () => { starts.push(Date.now() - t0) })
    starts.sort((a, b) => a - b)
    expect(starts[5]!).toBeGreaterThanOrEqual(230)
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(35)
  })

  it('gives work that sends no request no pacing turn', async () => {
    const t0 = Date.now()
    const ran: number[] = []
    await runByHost(Array.from({ length: 20 }, (_v, i) => `https://one.example/${i}`), hostOfUrl, { concurrency: 4, perHost: 2, perHostRps: 2, skip: (u) => !u.endsWith('/0') }, async (u) => { ran.push(Number(u.split('/').pop())) })
    expect(ran.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_v, i) => i))
    expect(Date.now() - t0).toBeLessThan(400)
  })
})
