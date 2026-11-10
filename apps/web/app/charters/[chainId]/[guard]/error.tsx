'use client'
import styles from '../../charters.module.css'
export default function CharterReadError({ reset }: { reset: () => void }) {
  return <main className={styles.page}><nav className={styles.crumbs} aria-label="Breadcrumb"><a href="/charters">Charters</a></nav><h1>The charter could not be read just now</h1><p>Network data is temporarily unavailable. This does not mean the charter is missing.</p><button type="button" className="btn btn--primary" onClick={reset}>Read again</button><p><a href="/me?tab=charters">My charters</a></p></main>
}
