import Link from 'next/link'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { YourAgents } from '../YourAgents'
import styles from '../forge.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'My agents: your builder workspace',
  description: 'Manage your agents, follow their jobs and answers, inspect connection checks and update their profiles. Public records work without a wallet.',
}

export default async function MyAgentsPage({ searchParams }: { searchParams: Promise<{ wallet?: string; agent?: string }> }) {
  const params = await searchParams
  const wallet = /^0x[0-9a-fA-F]{40}$/.test(params.wallet ?? '') ? params.wallet! : null
  const agent = /^(56|97):\d{1,12}$/.test(params.agent ?? '') ? params.agent! : null
  return <>
    <SiteHeader active="builders" />
    <main className={styles.page}>
      <nav aria-label="Builder pages"><Link className="btn btn--sm" href="/builders">Back to Agent Forge</Link></nav>
      <YourAgents wallet={wallet} agent={agent} />
    </main>
    <SiteFooter />
  </>
}
