import { describe, expect, it } from 'vitest'
import { workspaceNavigation, todayLanes, type WorkspaceNeed } from './workspace-nav'
describe('My Marque links', () => {
  it('defaults to Today and keeps the Building preference when there is no explicit link', () => {
    expect(workspaceNavigation(null, null)).toEqual({ view: 'hiring', tab: 'today', history: false })
    expect(workspaceNavigation(null, null, 'building').tab).toBe('agents')
  })
  it.each(['jobs', 'money'])('preserves old ?view=%s links despite a Building preference', tab => {
    expect(workspaceNavigation(tab, null, 'building')).toEqual({ view: 'hiring', tab, history: false })
  })
  it('maps old Watching and Logbook links, including explicit tab= links', () => {
    expect(workspaceNavigation('watching', null).tab).toBe('positions')
    expect(workspaceNavigation('logbook', null)).toEqual({ view: 'hiring', tab: 'jobs', history: true })
    expect(workspaceNavigation('building', 'logbook')).toEqual({ view: 'building', tab: 'agents', history: true })
    expect(workspaceNavigation('hiring', 'money').tab).toBe('money')
    expect(workspaceNavigation(null, 'agents').view).toBe('building')
  })
})
describe('Today priority', () => {
  const need = (kind: string, deadline: string | null, chainId = 56): WorkspaceNeed => ({ kind, deadline, chainId, title: 'Agent A', sentence: '', jobId: '1', action: { label: 'Open', href: '/jobs/56/1' }, side: 'hiring' })
  it('puts money at risk before clocks and tidy-up, ordering clocks by their deadlines', () => {
    const groups = todayLanes([need('rate', null), need('review', '2026-11-09T00:00:00Z'), need('approval', null), need('reclaim', null), need('review', '2026-11-07T00:00:00Z'), need('watch', null)])
    expect(groups.map(g => g.id)).toEqual(['risk', 'clocks', 'tidy'])
    expect(groups[1]!.rows.map(r => r.deadline)).toEqual(['2026-11-07T00:00:00Z', '2026-11-09T00:00:00Z'])
  })
  it('groups rating reminders only on the same network and keeps malformed deadlines last', () => {
    const groups = todayLanes([need('rate', null), need('rate', null), need('rate', null, 97), need('review', 'broken'), need('review', '2026-11-07T00:00:00Z')])
    expect(groups[1]!.rows.map(r => r.jobs)).toEqual([2, 1])
    expect(groups[0]!.rows[1]!.deadline).toBe('broken')
  })
  it('keeps a future reclaim deadline in clocks rather than implying the funds are reclaimable now', () => {
    const groups = todayLanes([need('reclaim', '2026-11-07T00:00:00Z'), need('reclaim', null)], Date.parse('2026-11-06T00:00:00Z'))
    expect(groups.map(g => g.id)).toEqual(['risk', 'clocks'])
    expect(groups[0]!.rows[0]!.deadline).toBeNull()
  })
})
