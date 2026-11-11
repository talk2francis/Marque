// Shared by the external generator, host supervisor and traffic-free regression tests.
export function validateWindow(release, notBefore, now = Date.now()) {
  if (!/^[a-f0-9]{40}$/.test(release ?? '')) throw new Error('Expected a complete release SHA')
  const start = Date.parse(notBefore)
  if (!Number.isFinite(start) || now < start || now > start + 30 * 60_000) throw new Error('Outside the approved 30-minute start window')
}

export function checkHealth(health, release) {
  if (health.ok !== true || health.release !== release) throw new Error('Production health or release changed')
}

export function persistentProcesses(rows) {
  return rows.filter(p => p.name.startsWith('marque-') && p.name !== 'marque-charters-keys' && p.pm2_env.status === 'online')
    .map(p => ({ id: p.pm_id, name: p.name, restarts: p.pm2_env.restart_time ?? 0 }))
}

export function checkHost(baseline, current, availableKB) {
  if (availableKB < 1_048_576) throw new Error('Available host memory below 1 GiB')
  for (const old of baseline) {
    const next = current.find(p => p.id === old.id && p.name === old.name)
    if (!next || next.restarts !== old.restarts) throw new Error(`Persistent process changed: ${old.name}/${old.id}`)
  }
}

export function collectResponses(lines, counts = {}) {
  for (const line of lines) {
    if (!line.trim()) continue
    const point = JSON.parse(line)
    if (point.type !== 'Point' || point.metric !== 'http_req_duration') continue
    const status = String(point.data.tags.status)
    counts[status] = (counts[status] ?? 0) + 1
  }
  return counts
}

export function completedStage(exitCode, counts) {
  if (exitCode !== 0) throw new Error(`k6 exited ${exitCode}; no higher stage may start`)
  if (!Object.values(counts).some(n => n > 0)) throw new Error('No request measurements')
  if (Object.keys(counts).some(status => Number(status) >= 400 || Number(status) === 0)) throw new Error('HTTP errors prevent a capacity pass')
}
