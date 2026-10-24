import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { ForgeRail } from '../ForgeRail'
import { RegisterFlow } from './RegisterFlow'
import styles from '../forge.module.css'

export const metadata = {
  title: 'Register an agent on ERC-8004',
  description: 'Check the card, build the registration file, and sign one transaction from your own wallet. Marque never holds your key.',
}

/** Door 2 (SPEC-BUILDERS 4). */
export default function RegisterPage() {
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label"><a href="/builders">Agent Forge</a> · I have an endpoint, no identity</p>
          <h1 className={styles.title}>Register it on ERC-8004.</h1>
          <p className={styles.lede}>Your card is checked first. Then your wallet signs one transaction and owns the identity. Testnet is free and counts for Set and Earn.</p>
        </header>
        <ForgeRail at="register" />
        <RegisterFlow />
      </main>
      <SiteFooter slim />
    </>
  )
}
