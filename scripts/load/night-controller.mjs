// One-shot VPS supervisor. Only public workflow inputs leave the VPS; no environment or database export.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { validateWindow, checkHealth, persistentProcesses, checkHost } from './capacity-guards.mjs'

const config = JSON.parse(await readFile(process.argv[2], 'utf8'))
const { release, notBefore, out } = config
const repo = 'talk2francis/Marque'
validateWindow(release, notBefore)
await mkdir(out, { recursive: false })
const key = `night-${new Date().toISOString().replace(/[^0-9]/g, '')}`
const record = { key, release, notBefore, startedAt: new Date().toISOString() }
const save = () => writeFile(`${out}/controller.json`, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 })
const gh = args => execFileSync('/usr/bin/gh', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 })
const api = path => JSON.parse(gh(['api', `repos/${repo}/${path}`]))
const sample = async () => {
  // PM2's environment stays in memory. Persist only names, IDs and numeric restart counters.
  const rows = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15_000 }))
  const meminfo = await readFile('/proc/meminfo', 'utf8')
  const availableKB = Number(/^MemAvailable:\s+(\d+)/m.exec(meminfo)?.[1] ?? 0)
  const data = {
    at: new Date().toISOString(), availableKB, processes: persistentProcesses(rows),
    load: (await readFile('/proc/loadavg', 'utf8')).trim(),
    memoryPressure: (await readFile('/proc/pressure/memory', 'utf8')).trim(),
    cpu: (await readFile('/proc/stat', 'utf8')).split('\n')[0],
  }
  await appendFile(`${out}/host.jsonl`, JSON.stringify(data) + '\n', { mode: 0o600 })
  const response = await fetch('https://marque.trade/api/health', { signal: AbortSignal.timeout(8000), cache: 'no-store' })
  if (!response.ok) throw new Error(`Health HTTP ${response.status}`)
  checkHealth(await response.json(), release)
  return data
}
let runId, completed = false
const cancel = () => {
  if (runId && !completed) gh(['run', 'cancel', String(runId), '--repo', repo])
}
let interrupted = false
process.on('SIGTERM', () => { interrupted = true })
process.on('SIGINT', () => { interrupted = true })
try {
  const commands = execFileSync('ps', ['-eo', 'args='], { encoding: 'utf8', timeout: 5000 })
  if (/\b(next build|pnpm[^\n]*\bbuild|bash scripts\/build-web\.sh)\b/m.test(commands)) throw new Error('A production build is active')
  const baseline = await sample()
  checkHost(baseline.processes, baseline.processes, baseline.availableKB)
  gh(['workflow', 'run', 'capacity.yml', '--repo', repo, '--ref', 'main', '-f', `expected_release=${release}`, '-f', `not_before=${notBefore}`, '-f', `run_key=${key}`, '-f', 'dry_run=false'])
  record.dispatchedAt = new Date().toISOString()
  await save()
  for (let i = 0; i < 60 && !runId; i++) {
    const runs = api('actions/workflows/capacity.yml/runs?event=workflow_dispatch&per_page=30').workflow_runs
    runId = runs.find(r => r.display_title === `capacity-${key}`)?.id
    if (!runId) await delay(5000)
  }
  if (!runId) throw new Error(`Workflow dispatched but its ID was not found; locate capacity-${key} in Actions`)
  record.runId = runId
  record.url = `https://github.com/${repo}/actions/runs/${runId}`
  await save()
  while (!completed) {
    if (interrupted) throw new Error('Supervisor interrupted')
    if (Date.now() - Date.parse(record.startedAt) > 28 * 60_000) throw new Error('Supervisor deadline exceeded')
    const data = await sample()
    checkHost(baseline.processes, data.processes, data.availableKB)
    const run = api(`actions/runs/${runId}`)
    completed = run.status === 'completed'
    if (completed) record.conclusion = run.conclusion
    else await delay(5000)
  }
} catch (error) {
  record.failure = error.message
  process.exitCode = 1
  try { cancel() } catch (cancelError) { record.cancelFailure = cancelError.message }
} finally {
  if (runId) {
    // Cancellation can take a few seconds before GitHub finalizes the failed-run artifact.
    for (let i = 0; i < 12 && !completed; i++) {
      try { completed = api(`actions/runs/${runId}`).status === 'completed' } catch { /* retained below */ }
      if (!completed) await delay(5000)
    }
    try { gh(['run', 'download', String(runId), '--repo', repo, '--dir', `${out}/artifacts`]) }
    catch (error) { record.artifactDownloadFailure = error.message }
  }
  record.endedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify(record))
  if (record.conclusion && record.conclusion !== 'success') process.exitCode = 1
}
