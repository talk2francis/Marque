'use client'
import { useEffect, useState } from 'react'
import styles from './docs.module.css'
export interface DocSection { id: string; title: string }
export function DocsShell({ sections, children }: { sections: DocSection[]; children: React.ReactNode }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a,b) => a.boundingClientRect.top-b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, {rootMargin: '-100px 0px -55% 0px'})
    sections.forEach(({id}) => { const el=document.getElementById(id); if(el) observer.observe(el) })
    return () => observer.disconnect()
  }, [sections])
  const contents = <>
      <nav aria-label="Documentation library" className={styles.library}>
        <span className={styles.railHead}>Library</span>
        <a href="/docs">Getting started</a><a href="/docs/faq">Frequently asked questions</a>
        <a href="/docs/whitepaper">Whitepaper</a><a href="/docs/changelog">Changelog</a>
        <a href="/docs/terms">Terms of use</a><a href="/docs/privacy">Privacy policy</a><a href="/docs/risks">Risk disclosure</a>
      </nav>
      <nav aria-label="On this page"><span className={styles.railHead}>On this page</span>
        <ol className={styles.railList}>{sections.map(s=><li key={s.id}><a href={'#'+s.id} className={active===s.id ? styles.railActive : undefined} aria-current={active===s.id ? 'location':undefined}>{s.title}</a></li>)}</ol>
      </nav>
    </>
  return <div className={styles.wrap}>
    <aside className={styles.rail}>{contents}</aside>
    <details className={styles.mobileContents}><summary>Explore the library and this page</summary>{contents}</details>
    <div className={styles.docCol}>{children}<div className={styles.help}>Still have a question? <a href="https://t.me/marque_marketplace">Talk to the team on Telegram</a>. Never share a private key or recovery phrase.</div></div>
  </div>
}
