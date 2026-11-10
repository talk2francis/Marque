'use client'
import { SiteHeader, SiteFooter } from '../../../_components/SiteHeader'
import styles from '../../charters.module.css'
export default function CharterReadError({ reset }: { reset: () => void }) {
  return <><SiteHeader /><main className={styles.page}><h1>The charter could not be read just now</h1><p>The network or index is temporarily unavailable. This does not mean the charter is missing.</p><button type="button" className="btn btn--primary" onClick={reset}>Read again</button><p><a href="/me?tab=charters">My charters</a></p></main><SiteFooter slim /></>
}
