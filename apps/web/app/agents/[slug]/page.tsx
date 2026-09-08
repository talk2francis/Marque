import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { Statement, Chip, WarrantBadge, ProvenanceChip, LinkButton } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { ReferenceMark } from '../../_components/ReferenceMark'
import { AgentAvatar } from '../../_components/AgentAvatar'
import {
  REFERENCE_AGENTS, referenceAgent, ERC8004_REGISTRY_MAINNET,
} from '../../../lib/reference-agents'
import { explorerAddress, explorerTx } from '../../../lib/network'
import styles from './slug.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export function generateStaticParams() {
  return REFERENCE_AGENTS.map((a) => ({ slug: a.slug }))
}

const unwrap = (r: unknown): Array<Record<string, unknown>> =>
  ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

const TEST_FOR: Record<string, string> = {
  rebalancing: 'MCS-REB-1', grid: 'MCS-GRID-1', yield: 'MCS-YIELD-1',
  health_factor: 'MCS-HF-1', security: '—',
}
const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing', grid: 'Grid trading', yield: 'Yield optimisation',
  health_factor: 'Health factor', security: 'Security',
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = referenceAgent(slug)
  return a
    ? { title: `${a.name} — reference agent`, description: a.blurb }
    : { title: 'Agent not found' }
}

export default async function ReferenceAgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const agent = referenceAgent(slug)
  if (!agent) notFound()

  const testId = TEST_FOR[agent.category]
  const conf = await db().execute(sql`
    select test_id, pass, failed_fields, ran_at, block_number, latency_ms, error
    from conformance_result
    where agent_id = ${agent.id} order by ran_at desc limit 10
  `).then(unwrap).catch(() => [])

  const latest = conf[0]
  const passes = conf.filter((r) => r['pass'] === true).length
  const publicUrl = process.env[agent.publicUrlEnv] ?? `https://marque.trade/agents/${agent.slug}`
  const cardUrl = `https://marque.trade/agents/${agent.slug}/.well-known/agent-card.json`

  const warrant = latest
    ? {
        status: latest['pass'] === true ? ('warranted' as const) : ('failed' as const),
        date: latest['ran_at'] ? String(latest['ran_at']).slice(0, 10) : undefined,
        testId: latest['test_id'] ? String(latest['test_id']) : undefined,
      }
    : { status: 'untested' as const }

  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.head}>
          <div className={styles.title}>
            <AgentAvatar id={agent.id} category={agent.category} reference size={52} />
            <Statement as="h1" size="page">{agent.name}</Statement>
            <ReferenceMark />
          </div>
          <p className={styles.blurb}>{agent.blurb}</p>
          <div className={styles.badges}>
            <Chip>{CATEGORY_LABEL[agent.category] ?? agent.category}</Chip>
            <Chip tone="chain">A2A</Chip>
            <WarrantBadge status={warrant.status} date={warrant.date} testId={warrant.testId} />
          </div>
          <div className={styles.actions}>
            <LinkButton variant="primary" href={`/app/charter?agent=${encodeURIComponent(agent.id)}&category=${agent.category}`}>
              Hire {agent.name}
            </LinkButton>
            <LinkButton variant="secondary" href={`/builders/test`}>Run its test yourself</LinkButton>
          </div>
        </header>

        <section className={styles.section} id="preview">
          <h2 className={styles.h2}>What it is</h2>
          <p className={styles.body}>
            {agent.name} is one of five agents Marque runs itself, one per category, so a buyer is
            never left with an empty category to try. It is labelled <em>Marque reference agent</em> 
            everywhere it appears, held to exactly the same standard as any third party, and ranked
            by the same rules — including when a third party beats it. Its answer is deterministic:
            no language model is in the path.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Conformance</h2>
          {conf.length === 0 ? (
            <p className={styles.muted}>Not yet run against {testId}.</p>
          ) : (
            <>
              <p className={styles.body}>
                <ProvenanceChip provenance="TESTED" /> {passes} of {conf.length} recent runs passed{' '}
                <span className="mono">{testId}</span>. Every run is graded field by field against
                numbers Marque computes itself from chain state at a pinned block.
              </p>
              <table className={styles.table}>
                <thead><tr><th>Test</th><th>Verdict</th><th>Block</th><th>Latency</th><th>Ran</th></tr></thead>
                <tbody>
                  {conf.map((r, i) => (
                    <tr key={i}>
                      <td className="mono">{String(r['test_id'])}</td>
                      <td>{r['error'] ? <Chip tone="watch">no answer</Chip> : r['pass'] ? <Chip tone="holds">pass</Chip> : <Chip tone="breach">fail</Chip>}</td>
                      <td className="mono">{String(r['block_number'] ?? '—')}</td>
                      <td className="mono">{r['latency_ms'] ? `${r['latency_ms']} ms` : '—'}</td>
                      <td className="mono">{r['ran_at'] ? String(r['ran_at']).slice(0, 16).replace('T', ' ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className={styles.muted}>
            Full spec and every third-party result on <a href={`/standard/${testId}`}>{testId}</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Endpoints and identity</h2>
          <dl className={styles.facts}>
            <div><dt>A2A card</dt><dd><a href={cardUrl} target="_blank" rel="noreferrer" className="mono">{cardUrl}</a></dd></div>
            <div><dt>Service</dt><dd><a href={publicUrl} target="_blank" rel="noreferrer" className="mono">{publicUrl}</a></dd></div>
            <div><dt>Price</dt><dd className="mono">0.15 U per call</dd></div>
            <div>
              <dt>ERC-8004 identity</dt>
              <dd className="mono">
                <a href={explorerTx(56, agent.erc8004.registerTx)} target="_blank" rel="noreferrer">
                  token {agent.erc8004.tokenId} · BSC mainnet · 56
                </a>
                {' · '}
                <a href={explorerAddress(56, ERC8004_REGISTRY_MAINNET)} target="_blank" rel="noreferrer">
                  registry
                </a>
              </dd>
            </div>
            <div>
              <dt>Agent wallet</dt>
              <dd className="mono">
                <a href={explorerAddress(56, agent.erc8004.wallet)} target="_blank" rel="noreferrer">
                  {agent.erc8004.wallet.slice(0, 10)}…{agent.erc8004.wallet.slice(-6)}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
