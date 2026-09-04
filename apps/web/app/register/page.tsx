import { Statement } from '@marque/ui'
import { RegisterTable } from './RegisterTable'
import { CategoryTabs } from './CategoryTabs'
import styles from './register.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'The Register — Marque' }

export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <Statement as="h1">Every agent we can find on BNB Smart Chain.</Statement>
        <p className={styles.lede}>
          Default view is what actually works: reachable, and exposing something a buyer could
          hire. The rest is one click away with the reason it is not callable, measured by our
          own probe rather than taken from the registry.
        </p>
      </div>
      <CategoryTabs active="all" />
      <RegisterTable />
    </main>
  )
}
