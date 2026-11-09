export type WorkspaceView = 'hiring' | 'building'
export type HiringTab = 'today' | 'positions' | 'charters' | 'jobs' | 'money'
export type BuildingTab = 'agents' | 'bench' | 'demand'
export interface WorkspaceNavigation { view: WorkspaceView; tab: HiringTab | BuildingTab; history: boolean }

/** Old view= and tab= links remain valid. Explicit links take precedence over the local view preference. */
export function workspaceNavigation(view: string | null, tab: string | null, preferred: WorkspaceView = 'hiring'): WorkspaceNavigation {
  const side = view === 'building' || view === 'hiring' ? view : preferred
  const asked = tab ?? (view === 'building' || view === 'hiring' ? null : view)
  if (asked && ['agents', 'bench', 'demand'].includes(asked)) return { view: 'building', tab: asked as BuildingTab, history: false }
  if (asked === 'logbook' || asked === 'history') return { view: side, tab: side === 'building' ? 'agents' : 'jobs', history: true }
  if (asked === 'watching') return { view: 'hiring', tab: 'positions', history: false }
  if (asked && ['today', 'positions', 'charters', 'jobs', 'money'].includes(asked)) return { view: 'hiring', tab: asked as HiringTab, history: false }
  return { view: side, tab: side === 'building' ? 'agents' : 'today', history: false }
}

export interface WorkspaceNeed {
  kind: string; title: string; sentence: string; deadline: string | null; chainId: number | null; jobId: string | null
  amount?: string | null
  action: { label: string; href?: string; do?: 'revoke' | 'reclaim' | 'rate'; token?: string }
  side: WorkspaceView
}
export type TodayLane = { id: string; label: string; rows: Array<WorkspaceNeed & { jobs: number }> }
const groups = [
  { id: 'risk', label: 'Money at risk', kinds: ['watch', 'reclaim'] },
  { id: 'clocks', label: 'Clocks running', kinds: ['review', 'deliver', 'criterion', 'unfinished'] },
  { id: 'tidy', label: 'Tidy up', kinds: ['rate', 'approval'] },
] as const
const due = (s: string | null) => s && Number.isFinite(Date.parse(s)) ? Date.parse(s) : Infinity

export function todayLanes(needs: WorkspaceNeed[], now = Date.now()): TodayLane[] {
  const groupOf = (n: WorkspaceNeed) => n.kind === 'reclaim' && n.deadline !== null && (!Number.isFinite(Date.parse(n.deadline)) || Date.parse(n.deadline) > now) ? 'clocks'
    : groups.find(g => (g.kinds as readonly string[]).includes(n.kind))?.id
  return groups.map(group => {
    const rows: TodayLane['rows'] = []
    for (const need of needs.filter(n => groupOf(n) === group.id)) {
      const same = need.kind === 'rate' ? rows.find(r => r.kind === 'rate' && r.title === need.title && r.chainId === need.chainId) : undefined
      if (same) { same.jobs++; same.amount = null }
      else rows.push({ ...need, jobs: 1 })
    }
    rows.sort((a, b) => due(a.deadline) - due(b.deadline))
    return { id: group.id, label: group.label, rows }
  }).filter(group => group.rows.length > 0)
}
