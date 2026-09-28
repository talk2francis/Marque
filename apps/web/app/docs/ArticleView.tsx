import { DocSection, DocShell } from './_ui/DocShell'
import type { Article } from './articles'
import styles from './docs.module.css'

/** A library article (whitepaper, changelog, risks, terms, privacy) in the docs shell. */
export function ArticleView({ slug, article }: { slug: string; article: Article }) {
  return (
    <DocShell
      current={slug}
      label={article.label}
      title={article.title}
      lede={article.description}
      sections={article.sections.map(({ id, title }) => ({ id, label: title.replace(/^\d{1,2} \w+ \d{4} · /, '') }))}
    >
      {article.sections.map((s) => (
        <DocSection key={s.id} id={s.id} title={s.title}>
          {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          {s.links?.length ? (
            <ul className={styles.links}>
              {s.links.map((l) => <li key={l.href}><a href={l.href} {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{l.label}</a></li>)}
            </ul>
          ) : null}
        </DocSection>
      ))}
    </DocShell>
  )
}
