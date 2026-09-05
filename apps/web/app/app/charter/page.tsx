import { Statement, Chip, EmptyState } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { CharterDesk } from './CharterDesk'
import { TEMPLATES, CATEGORY_ORDER, isCharterCategory, UNIVERSAL_MAY_NOT } from '../../../lib/charter-templates'
import { callableAgents } from '../../../lib/agents'
import { charterServiceAvailable, CHARTER_CHAIN_NAME } from '../../../lib/charters'
import styles from './charter.module.css'

export const dynamic = 'force-dynamic'

/**
 * The Charter Desk.
 *
 * The screen where a person decides how much of their money an agent may touch.
 * It is written for someone who has never heard of a session key, because
 * AGENTS.md invariant 14 says a screen that needs a glossary is wrong, and
 * because the words that make this decision safe are "may" and "may not" — not
 * "scoped delegation".
 *
 * Nothing here is a preview. Granting writes a transaction on
 * BNB Smart Chain testnet and the charter that comes back is revocable from
 * the strip at the top of every page.
 */

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing',
  grid: 'Grid trading',
  yield: 'Yield optimisation',
  health_factor: 'Health factor',
}

export default async function CharterDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; agent?: string }>
}) {
  const params = await searchParams
  const category = params.category && isCharterCategory(params.category) ? params.category : 'rebalancing'
  const template = TEMPLATES[category]
  const agents = await callableAgents(category).catch(() => [])
  const preselected = params.agent && agents.some((a) => a.agentId === params.agent)
    ? params.agent
    : agents[0]?.agentId ?? null

  return (
    <>
      <SiteHeader active="charters" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">{template.name}</Statement>
          <p className={styles.lede}>{template.purpose}</p>
          <p className={styles.note}>
            A charter is authority with an edge on it. You set what the agent may touch, how much
            it may spend and how long it has. Outside those three bounds it cannot act at all, and
            you can end it in one transaction at any moment.
          </p>
        </header>

        <nav className={styles.tabs} aria-label="Charter category">
          {CATEGORY_ORDER.map((key) => (
            <a
              key={key}
              className={styles.tab}
              href={`/app/charter?category=${key}`}
              aria-current={key === category ? 'page' : undefined}
            >
              {CATEGORY_LABEL[key]}
            </a>
          ))}
        </nav>

        {!charterServiceAvailable() ? (
          <EmptyState title="Charters are not configured on this deployment.">
            <p>
              The charter service needs a testnet signer and the MarqueRegistry address. Without
              them a grant would be a picture of a grant, so the desk refuses to draw one.
            </p>
          </EmptyState>
        ) : agents.length === 0 ? (
          <EmptyState title={`No agent in ${CATEGORY_LABEL[category]} is callable right now.`}>
            <p>
              Every agent we have indexed in this category either does not answer or answers
              without being bound to a runtime. A charter granted to an endpoint that cannot be
              called would be theatre, so the desk will not issue one.
            </p>
            <p>
              <a href={`/register/${category === 'health_factor' ? 'health-factor' : category}`}>
                See the whole category, including the agents that failed
              </a>
            </p>
          </EmptyState>
        ) : (
          <CharterDesk
            category={category}
            template={template}
            universalMayNot={UNIVERSAL_MAY_NOT}
            agents={agents}
            preselectedAgentId={preselected}
            chainName={CHARTER_CHAIN_NAME}
          />
        )}

        <section className={styles.footnote}>
          <Chip tone="chain">On chain</Chip>
          <p>
            Charters are granted on {CHARTER_CHAIN_NAME}. Mainnet authority is a separate decision
            with a separate approval, and nothing on this page can reach it. The wallet that signs
            is Marque&rsquo;s own testnet wallet, not yours — so a judge with no wallet can grant,
            watch and revoke a real charter, and every transaction below is a real one you can open
            on BscScan.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
