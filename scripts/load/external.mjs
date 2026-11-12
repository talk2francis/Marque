// No VPS credentials. The November workload is unchanged; this adds admission and release guards.
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { validateWindow, checkHealth, collectResponses, completedStage, measuredHoldCompleted } from './capacity-guards.mjs'

const out = process.env.CAPACITY_OUT ?? 'capacity-results'
const release = process.env.EXPECTED_RELEASE
const notBefore = process.env.NOT_BEFORE
const dryRun = process.env.DRY_RUN === 'true'
const workload = 'scripts/load/read-mix.js'
const manifest = {
  startedAt: new Date().toISOString(), release, notBefore, dryRun,
  generator: 'GitHub Actions ubuntu-latest; one external source IP',
  generatorRevision: process.env.GITHUB_SHA ?? null,
  workloadSHA256: createHash('sha256').update(await readFile(workload)).digest('hex'),
  stages: [],
}
await mkdir(out, { recursive: false }) // Never overwrite a prior observation.
const save = () => writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
await save()
if (dryRun) {
  manifest.plan = 'No HTTP requests made. Planned 25, 50, 100, 250 VUs; 20s ramp, 90s hold, 5s down, 20s between; stop on first failure.'
  await save()
  console.log(manifest.plan)
} else {
  const health = async () => {
    const response = await fetch('https://marque.trade/api/health', { signal: AbortSignal.timeout(8000), cache: 'no-store' })
    if (!response.ok) throw new Error(`Health HTTP ${response.status}`)
    checkHealth(await response.json(), release)
  }
  let child
  const terminate = () => { if (child && child.exitCode === null) child.kill('SIGINT') }
  process.on('SIGTERM', terminate)
  process.on('SIGINT', terminate)
  try {
    validateWindow(release, notBefore)
    for (const vus of [25, 50, 100, 250]) {
      validateWindow(release, notBefore)
      await health()
      const stage = { vus, startedAt: new Date().toISOString(), counts: {}, completedHold: false }
      manifest.stages.push(stage)
      await save()
      const raw = `${out}/raw-${vus}.json`
      const log = createWriteStream(`${out}/k6-${vus}.txt`, { flags: 'wx' })
      const file = await open(raw, 'wx')
      await file.close()
      child = spawn('k6', ['run', '--quiet', '-e', 'BASE=https://marque.trade', '-e', `VUS=${vus}`, '-e', 'HOLD=90s', '--summary-export', `${out}/summary-${vus}.json`, '--out', `json=${raw}`, workload], { stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.pipe(log, { end: false })
      child.stderr.pipe(log, { end: false })
      let finished = false, position = 0, pending = '', guardError
      const exited = new Promise((resolve, reject) => {
        child.once('error', error => { finished = true; reject(error) })
        child.once('close', (code, signal) => { finished = true; resolve({ code, signal }) })
      })
      // Read only new bytes, retaining incomplete lines between samples.
      const sample = async () => {
        const fd = await open(raw, 'r')
        try {
          const size = (await fd.stat()).size
          if (size > position) {
            const buffer = Buffer.alloc(size - position)
            const { bytesRead } = await fd.read(buffer, 0, buffer.length, position)
            position += bytesRead
            const lines = (pending + buffer.subarray(0, bytesRead).toString()).split('\n')
            pending = lines.pop()
            collectResponses(lines, stage.counts)
          }
        } finally { await fd.close() }
      }
      while (!finished) {
        await delay(5000)
        try {
          await sample()
          if (stage.counts['429']) throw new Error('Rate limit reached; admission limit is not backend throughput')
          if (Date.now() - Date.parse(stage.startedAt) > 180_000) throw new Error('Stage deadline exceeded')
          await health()
        } catch (error) { guardError = error; terminate(); break }
      }
      // Give k6 time to flush failed-run evidence, then bound shutdown.
      const killTimer = setTimeout(() => { if (!finished) child.kill('SIGKILL') }, 10_000)
      const result = await exited
      clearTimeout(killTimer)
      await sample()
      log.end()
      Object.assign(stage, { ...result, endedAt: new Date().toISOString() })
      try { stage.completedHold = measuredHoldCompleted(JSON.parse(await readFile(`${out}/summary-${vus}.json`, 'utf8'))) }
      catch { stage.holdCompletionUnknown = true }
      try {
        if (guardError) throw guardError
        completedStage(result.code, stage.counts)
        if (!stage.completedHold) throw new Error('A full hold was not measured; no higher stage may start')
        stage.passed = true
      } catch (error) { stage.failure = error.message; await save(); throw error }
      await save()
      if (vus !== 250) await delay(20_000)
    }
    manifest.passed = true
  } catch (error) {
    manifest.failure = error.message
    process.exitCode = 1
    console.error(error.message)
  } finally {
    terminate()
    manifest.endedAt = new Date().toISOString()
    await save()
  }
}
