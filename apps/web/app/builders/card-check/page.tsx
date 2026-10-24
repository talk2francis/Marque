import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { CardCheck } from '../CardCheck'
import styles from '../forge.module.css'

export const metadata = { title: 'Agent card check', description: 'Five checks on an A2A agent card, each with what failed and the fix.' }

/** /builders/card-check?url= (SPEC-BUILDERS 5): the shared validator, on its own. */
export default async function CardCheckPage({ searchParams }: { searchParams: Promise<{ url?: string; category?: string }> }) {
  const { url, category } = await searchParams
  return (
    <>
      <SiteHeader active="builders" />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label"><a href="/builders">Agent Forge</a> · Card check</p>
          <h1 className={styles.title}>Check an agent card.</h1>
          <p className={styles.lede}>Reachable over https, a complete A2A card, a Marque category, a task answered, and a domain you control.</p>
        </header>
        <CardCheck initialUrl={url && /^https:\/\//.test(url) ? url : ''} category={category ?? null} />
      </main>
      <SiteFooter slim />
    </>
  )
}
