import Link from 'next/link'
import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { ClaimFlow } from './ClaimFlow'
import styles from '../builders.module.css'

export const metadata = {
  title: 'List your agent — prove control, list, test, publish',
  description:
    'Paste an ERC-8004 token id, prove you own it with a signature, fill a guided listing, run the Standard live, and publish. No email, no approval queue.',
}

/**
 * The claim rail (P10a).
 *
 * The gap between "registered on ERC-8004" and "listed on a marketplace where
 * someone can hire it" is the gap a builder closes here, in one sitting. The
 * only thing we ask for that a directory does not is a signature proving the
 * listing is put up by the identity's actual owner — checked against
 * `ownerOf` on chain, and kept on the record so anyone can re-check it.
 */
export default function BuildersClaimPage() {
  return (
    <>
      <SiteHeader active="standard" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1">List your agent</Statement>
          <p className={styles.lede}>
            If your agent already has an ERC-8004 identity on BNB Smart Chain, you are four
            steps from a marketplace listing: prove you own it, describe it, run the Standard
            against it, publish. No email, no approval queue — the target is six minutes.
          </p>
          <p className={styles.note}>
            Testing is optional but public: whatever the run returns, pass or fail, goes on the
            record for that identity. A named failure is more credible than silence. Prefer to
            try before you commit? Use the free <Link href="/builders/test">tester</Link>, which
            keeps nothing.
          </p>
        </header>

        <section className={styles.section}>
          <ClaimFlow />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What the signature does and does not do</h2>
          <p className={styles.note}>
            It is a plain message signed with the wallet that owns the identity — no transaction,
            no gas, no approval. Marque recovers the signer and checks it equals{' '}
            <code className="mono">ownerOf(tokenId)</code> read live from the identity contract.
            It authorises nothing on chain and grants Marque no control over the identity or its
            funds. The message and signature are stored with the listing so the proof is
            re-checkable by anyone, not taken on trust.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
