'use client'

import { readMachineCatalog } from '@marque/commerce/catalog'
import { useState } from 'react'
import Link from 'next/link'
import { Button, Chip, ProvenanceChip } from '@marque/ui'
import { isReferenceAgent } from '../../lib/reference-agents'
import styles from './judge.module.css'

type Agent = { id: string; name: string; evidence: string }

/** Read-only walkthrough. No task, grant, signature or simulated success step. */
export function JudgeFlow({ demoAddress }: { demoAddress: string }) {
  const [busy, setBusy] = useState<'position' | 'catalog' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<{ healthFactor: number; observedAt: string } | null>(null)
  const [agents, setAgents] = useState<Agent[] | null>(null)

  async function readPosition() {
    setBusy('position'); setError(null); setPosition(null)
    try {
      const response = await fetch(`/api/v1/positions/${demoAddress}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
      const body = await response.json() as { venus?: { ok?: boolean; healthFactor?: unknown } }
      const value = body.venus?.healthFactor
      if (!response.ok || !body.venus?.ok || typeof value !== 'number' || !Number.isFinite(value)) throw new Error('unavailable')
      setPosition({ healthFactor: value, observedAt: new Date().toISOString() })
    } catch {
      setError('The position read is unavailable. Try again later, or inspect recorded agent evidence below. No position value is substituted.')
    } finally { setBusy(null) }
  }

  async function readCatalog() {
    setBusy('catalog'); setError(null); setAgents(null)
    try {
      const catalog = await readMachineCatalog(window.location.origin, { category: 'health_factor', tab: 'all', limit: 3 })
      setAgents(catalog.agents.map(agent => ({
        id: agent.agentId, name: agent.name,
        evidence: `${agent.conformance.state === 'UNTESTED' ? 'No test recorded' : `Identity test history: ${agent.conformance.state.toLowerCase().replaceAll('_', ' ')}${agent.conformance.observedAt ? ` at ${agent.conformance.observedAt}` : ''}`}. Current exact-service quality, task suitability and independent control are not established by this catalog.`,
      })))
    } catch {
      setError('Recorded agent evidence is unavailable. Try again later or open the marketplace. No agent or result is substituted.')
    } finally { setBusy(null) }
  }

  return (
    <>
      {error && <p className={styles.warn} role="status">{error}</p>}
      <ol className={styles.steps}>
        <li className={styles.step}>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Read a public position</h2>
            <p className={styles.stepWhy}>BNB Smart Chain mainnet · 56. This reads the demo address from Venus. It does not connect a wallet or move funds.</p>
            <p className={styles.stepResult}>{demoAddress}</p>
            <div className={styles.stepActions}>
              <Button onClick={() => void readPosition()} disabled={busy !== null}>{busy === 'position' ? 'Reading position…' : 'Read the position'}</Button>
            </div>
            {position && <p className={styles.stepResult} role="status">Health factor {position.healthFactor.toFixed(3)} <ProvenanceChip provenance="ONCHAIN" /> Read at {position.observedAt}. This is an observation, not continuous monitoring.</p>}
          </div>
        </li>
        <li className={styles.step}>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Inspect recorded agent evidence</h2>
            <p className={styles.stepWhy}>Health-factor listings with dated identity test history. These are inspection results, not a task-qualified ranking or a live-price promise.</p>
            <div className={styles.stepActions}>
              <Button onClick={() => void readCatalog()} disabled={busy !== null}>{busy === 'catalog' ? 'Reading evidence…' : 'Read agent evidence'}</Button>
            </div>
            {agents && <div role="status">{agents.length === 0 ? <p className={styles.stepWhy}>No matching records were returned. Browse the marketplace for the current supply.</p> : <ul className={styles.agents}>{agents.map(agent => <li key={agent.id}>
              <span className={styles.agentRow}><Link href={`/agents/${encodeURIComponent(agent.id)}`}>{agent.name}</Link>{isReferenceAgent(agent.id) && <Chip tone="watch">Marque reference agent</Chip>}</span>
              <span className={styles.agentWhy}>{agent.evidence}</span>
            </li>)}</ul>}</div>}
          </div>
        </li>
        <li className={styles.step}>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Review authority and preserved evidence</h2>
            <p className={styles.stepWhy}>New action charters are disabled while buyer-owned onchain enforcement is unverified. The policy preview grants no authority. Service-fee escrow is a separate buyer-signed workflow.</p>
            <p className={styles.note}><Link href="/app/charter?category=health_factor">Preview policy</Link> · <Link href="/jobs/56/56916">Inspect historical Plinth job 56916</Link> · <Link href="/receipts/944bea48-7c7e-4afc-aa93-fbe126772362">Inspect a historical receipt</Link></p>
            <p className={styles.stepWhy}>These are two separate historical records. The job is not linked to this receipt, neither is a new hire, and different wallet addresses do not prove independent people. Inspect submission, completion, payment and quality separately.</p>
          </div>
        </li>
      </ol>
    </>
  )
}
