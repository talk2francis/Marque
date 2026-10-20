type Row = Record<string, unknown>
const iso = (v: unknown) => new Date(String(v)).toISOString()
type Evidence = { at: string; endpoint: string | null; via: 'builder' | 'probe' }

/** A failed different service or an untested card cannot revoke a measured live call. */
export function builderCallability(services: ReadonlyArray<{ endpoint: string }>, checks: Row[], probes: Row[]) {
  const declared = new Set(services.map(s => s.endpoint))
  const successes: Evidence[] = []
  const failures: Array<{ at: string; endpoint: string; reason: string }> = []
  let callabilityUnknown = false
  for (const c of checks) {
    if (c.kind !== 'probe' || !declared.has(String(c.endpoint))) continue
    const r = (c.result ?? {}) as Row
    if (r.callability === 'NOT_TESTED') callabilityUnknown = true
    if (c.ok === true) successes.push({ at: iso(c.checked_at), endpoint: String(c.endpoint), via: 'builder' })
    else if (!(r.callability === 'NOT_TESTED' || (r.discoveryOnly === true && typeof r.executableEndpoint === 'string' && /message\/send not validated|task acceptance unverified/.test(String(r.detail))))) {
      failures.push({ at: iso(c.checked_at), endpoint: String(c.endpoint), reason: String(r.detail ?? 'call failed') })
    }
  }
  for (const p of probes) {
    const endpoint = declared.has(String(p.declared_endpoint)) ? String(p.declared_endpoint) : String(p.resolved_endpoint)
    if (!declared.has(endpoint)) continue
    if (p.liveness === 'discovered') callabilityUnknown = true
    if (p.liveness === 'live') successes.push({ at: iso(p.checked_at), endpoint, via: 'probe' })
    else if (p.liveness === 'dead' || p.liveness === 'bad_schema' || (p.liveness === 'unbound' && !(typeof p.executable_endpoint === 'string' && /message\/send not validated/.test(String(p.detail))))) {
      failures.push({ at: iso(p.checked_at), endpoint, reason: String(p.detail ?? 'scheduled check failed') })
    }
  }
  successes.sort((a,b) => Date.parse(b.at) - Date.parse(a.at))
  failures.sort((a,b) => Date.parse(b.at) - Date.parse(a.at))
  const valid = successes.find(s => !failures.some(f => f.endpoint === s.endpoint && Date.parse(f.at) >= Date.parse(s.at)))
  const callable = valid ?? successes[0] ?? null
  const lastFailure = callable ? failures.find(f => f.endpoint === callable.endpoint && Date.parse(f.at) >= Date.parse(callable.at)) ?? null : failures[0] ?? null
  return { callable, lastFailure, callabilityUnknown }
}
