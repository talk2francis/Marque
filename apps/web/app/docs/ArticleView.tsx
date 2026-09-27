import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { DocsShell } from './DocsShell'
import type { Article } from './articles'
import styles from './docs.module.css'
export function ArticleView({article}:{article:Article}) {
 return <><SiteHeader active="docs"/><main className={styles.docsLayout}>
 <header className={styles.pageHead}><span className={styles.kicker}>The documentation library</span><Statement as="h1" size="page">{article.title}</Statement><p className={styles.lede}>{article.description}</p></header>
 <DocsShell sections={article.sections.map(({id,title})=>({id,title}))}>{article.sections.map(s=><section id={s.id} key={s.id} className={styles.docSection}>
 <h2 className={styles.h2}>{s.title}</h2>{s.paragraphs.map((p,i)=><p key={i}>{p}</p>)}
 {s.links && <ul className={styles.list}>{s.links.map(l=><li key={l.href}><a href={l.href}>{l.label}</a></li>)}</ul>}
 </section>)}</DocsShell></main><SiteFooter/></>
}
