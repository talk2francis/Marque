'use client'

import { useEffect, useMemo, useState } from 'react'
import { Row, Chip, DataCell, WarrantBadge, EmptyState, Button, ProvenanceChip } from '@marque/ui'
import styles from './register.module.css'

/**
 * The Register.
 *
 * Default filter is Working — reachable AND callable — because a directory that
 * defaults to everything is a directory of dead links, and clicking one is
 * exactly how a judge loses faith in a marketplace.
 *
 * The graveyard is one visible click away and every dead row states WHY it is
 * dead. Publishing the attrition is the most credible thing here
 * (AGENTS.md invariant 7), and it is only credible if the reason is legible.
 */

export type Status = 'working' | 'unbound' | 'dead' | 'all'

interface AgentRow {
  agentId: string
  tokenId: string
  name: string | null
  description: string | null
  ownerAddress: string | null
  classification: { category: string; confidence: number; method: string; rationale: string } | null
  liveness: { status: string; latencyMs: number | null; failureClass: string | null; skills: string[]; measuredAt: string } | null
  services: Array<{ kind: string; endpoint: string; resolvedEndpoint: string | null; isTemplate: boolean; declaredPrice: string | null }>
}

const FAILURE_COPY: Record<string, string> = {
  unbound: 'answers, but was never bound to a runtime — nothing to call',
  empty_tools: 'answers, but exposes no tools',
  timeout: 'endpoint did not respond in time',
  dns: 'hostname does not resolve',
  refused: 'connection refused',
  http_4xx: 'endpoint returned a client error',
  http_5xx: 'endpoint returned a server error',
  bad_schema: 'answered with a payload that does not match the protocol it declares',
  blocked_ssrf: 'endpoint points at a private address and was not contacted',
  template_unresolved: 'endpoint is a template we could not resolve',
  rate_limited: 'endpoint rate-limited us',
  unknown: 'did not answer',
}

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing',
  grid: 'Grid trading',
  yield: 'Yield',
  health_factor: 'Health factor',
  security: 'Security',
}

export function RegisterTable({ category, graveyard }: { category?: string; graveyard?: boolean }) {
  const [status, setStatus] = useState<Status>(graveyard ? 'unbound' : 'working')
  const TABS = (graveyard ? ['unbound', 'dead', 'all'] : ['working', 'unbound', 'dead', 'all']) as Status[]
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [counts, setCounts] = useState<Record<Status, number | null>>({ working: null, unbound: null, dead: null, all: null })
  const [countsAt, setCountsAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = (s: Status) =>
      `/api/v1/agents?status=${s}&limit=${graveyard ? 12 : 60}${category ? `&category=${category}` : ''}`

    void (async () => {
      try {
        const res = await fetch(qs(status), { cache: 'no-store' })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(json.detail ?? json.error ?? 'Could not load the Register.'); setAgents([]) }
        else setAgents(json.agents ?? [])
      } catch {
        if (!cancelled) setError('Could not reach the Register.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [status, category])

  // Real population counts for the toggle labels — COUNT(*) over each tab's own
  // predicate, not the page size. One call, memoised server-side for 5 minutes
  // (P10.5A item 1).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/v1/agents/counts${category ? `?category=${category}` : ''}`, { cache: 'no-store' })
        const j = await res.json()
        if (cancelled) return
        if (res.ok) {
          setCounts((c) => ({ ...c, working: j.working ?? null, unbound: j.unbound ?? null, dead: j.dead ?? null, all: j.all ?? null }))
          setCountsAt(j.computedAt ?? null)
        }
      } catch { /* labels fall back to no number */ }
    })()
    return () => { cancelled = true }
  }, [category])

  // Sorted so a reader's eye lands on real supply first, then everything else.
  const sorted = useMemo(
    () => [...agents].sort((a, b) => {
      const rank = (r: AgentRow) => (r.liveness?.status === 'live' ? 0 : r.liveness?.status === 'unbound' ? 1 : 2)
      return rank(a) - rank(b) || (a.name ?? '').localeCompare(b.name ?? '')
    }),
    [agents],
  )

  const fmt = (n: number | null) => (n === null ? '' : ` (${n.toLocaleString()})`)
  const label = (s: Status) => {
    const n = counts[s]
    if (s === 'working') return `Working${fmt(n)}`
    if (s === 'unbound') return `Registered but unreachable${fmt(n)}`
    if (s === 'dead') return `Dead endpoints${fmt(n)}`
    return 'Everything'
  }

  const countedAgo = (() => {
    if (!countsAt) return null
    const secs = Math.max(0, Math.round((Date.now() - Date.parse(countsAt)) / 1000))
    if (secs < 90) return 'just now'
    if (secs < 3600) return `${Math.round(secs / 60)}m ago`
    return `${Math.round(secs / 3600)}h ago`
  })()

  return (
    <>
      <div className={styles.filters} role="group" aria-label="Filter by status">
        {TABS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'primary' : 'secondary'}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
          >
            {label(s)}
          </Button>
        ))}
      </div>
      {countedAgo && (
        <p className={styles.status}>
          <ProvenanceChip provenance="MEASURED" /> Counts are a live COUNT over every indexed
          chain-56 agent, {countedAgo}. The list below shows the first {agents.length}.
        </p>
      )}

      {status !== 'working' && (
        <p className={styles.graveyardNote}>
          <ProvenanceChip provenance="MEASURED" /> These are shown, not hidden. Each row states
          why it is not callable, measured by our own probe rather than taken from the registry.
        </p>
      )}

      {loading && <p className={styles.status}>Loading the Register…</p>}
      {error && <div className={styles.error} role="alert">{error}</div>}

      {!loading && !error && sorted.length === 0 && (
        <EmptyState title={`No agent matches "${label(status)}" in this category yet.`}>
          <p>
            This is the real count, not a loading state. If you run an agent that belongs here,
            it can be tested against the published standard for free.
          </p>
        </EmptyState>
      )}

      {!loading && sorted.length > 0 && (
        <div className={styles.rows}>
          {sorted.map((a) => {
            const live = a.liveness?.status === 'live'
            const svc = a.services[0]
            const failure = a.liveness?.failureClass
            return (
              <Row key={a.agentId} href={`/agents/56/${a.tokenId}`} muted={!live}>
                <div className={styles.main}>
                  <span className={styles.name}>{a.name ?? `Agent ${a.tokenId}`}</span>
                  <span className={styles.sub}>
                    {live
                      ? a.liveness?.skills.length
                        ? `${a.liveness.skills.length} declared skill${a.liveness.skills.length === 1 ? '' : 's'}: ${a.liveness.skills.slice(0, 3).join(', ')}`
                        : 'callable'
                      : failure
                        ? FAILURE_COPY[failure] ?? failure
                        : a.liveness
                          ? a.liveness.status
                          : 'not yet probed'}
                  </span>
                </div>

                <span className={styles.meta}>
                  {a.classification && a.classification.category !== 'unclassified' && (
                    <Chip>{CATEGORY_LABEL[a.classification.category] ?? a.classification.category}</Chip>
                  )}
                  {svc && <Chip>{svc.kind}</Chip>}
                </span>

                <DataCell muted={!live}>
                  {a.liveness?.latencyMs != null ? `${a.liveness.latencyMs}ms` : '—'}
                </DataCell>

                <span className={styles.warrant}>
                  <WarrantBadge status="untested" />
                </span>
              </Row>
            )
          })}
        </div>
      )}
    </>
  )
}
