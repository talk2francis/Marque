/** Explicit acknowledgement only. Mentioning a job ID is not acceptance of work. */
export function notificationAcceptance(body: string, jobId: string): 'accepted' | 'rejected' | null {
  let root: unknown
  try { root = JSON.parse(body) } catch { return null }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null
  const rpc = root as Record<string, unknown>
  if (rpc['error']) return null
  let accepted = false, rejected = false, visited = 0
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || ++visited > 128 || value === null) return
    if (typeof value === 'string') { try { visit(JSON.parse(value), depth + 1) } catch { /* prose is not an acknowledgement */ } return }
    if (Array.isArray(value)) { for (const item of value.slice(0, 32)) visit(item, depth + 1); return }
    if (typeof value !== 'object') return
    const o = value as Record<string, unknown>
    if (o['error']) return
    const id = o['job_id'] ?? o['jobId']
    if (id !== undefined && String(id) !== jobId) return
    if (o['status'] === 'rejected' || o['accepted'] === false) rejected = true
    // An explicit receipt counts: {status: "accepted"}, {accepted: true}, {received: true} (one marketplace's sellers),
    // or {ok: true} with this job id (the BNB Agent Studio seller).
    if (o['status'] === 'accepted' || o['status'] === 'received' || o['accepted'] === true || o['received'] === true || (o['ok'] === true && id !== undefined)) accepted = true
    for (const key of ['result', 'parts', 'data', 'text', 'message', 'artifacts']) if (o[key] !== undefined) visit(o[key], depth + 1)
  }
  visit(rpc['result'] ?? rpc, 0)
  return rejected ? 'rejected' : accepted ? 'accepted' : null
}
