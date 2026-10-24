import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { ForgeRail } from '../ForgeRail'
import { LinkWallet } from '../LinkWallet'
import { LinkPicker } from './LinkPicker'
import styles from '../forge.module.css'

export const metadata = {
  title: 'Link your agent wallet',
  description: 'Point an ERC-8004 identity\'s agent wallet at your seller, so buyers accept its signed quotes. Your seller signs consent with its own keystore; your wallet sends one transaction.',
}

/** setAgentWallet for an identity registered from another wallet (Door 2's last step, reachable on its own). */
export default async function LinkPage({ searchParams }: { searchParams: Promise<{ chain?: string; token?: string }> }) {
  const { chain, token } = await searchParams
  const chainId = chain === '56' ? 56 : chain === '97' ? 97 : null
  const agentId = token && /^\d{1,12}$/.test(token) ? BigInt(token) : null
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label"><a href="/builders">Agent Forge</a> · Link your agent wallet</p>
          <h1 className={styles.title}>Let buyers trust your seller&apos;s quotes.</h1>
          <p className={styles.lede}>Your seller signs consent with its own key, your wallet sends one transaction, and quotes from that seller match your identity.</p>
        </header>
        <ForgeRail at="register" />
        {chainId && agentId !== null ? <LinkWallet chainId={chainId} agentId={agentId} /> : <LinkPicker />}
      </main>
      <SiteFooter slim />
    </>
  )
}
