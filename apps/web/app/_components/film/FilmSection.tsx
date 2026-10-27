import { Limits } from '@marque/ui'
import { BRAND } from '@marque/ui/brand'
import { CHAPTERS, FILM, filmArchived, filmJsonLd, mediaUrl } from '../../../lib/film'
import { FILM_MEDIA } from '../../../lib/film-media'
import { FilmPlayer } from './FilmPlayer'
import { FilmTime } from './FilmCue'
import styles from './film.module.css'

/**
 * The screening room: the launch film in a Chamber band, with what is real in it and every
 * word of it. Home (under the hero) and /film use the same section; /film opens the words and
 * offers the file.
 */
export function FilmSection({ context }: { context: 'home' | 'page' }) {
  const archived = filmArchived(Date.now())
  const Heading = context === 'page' ? 'h1' : 'h2'
  return (
    <section id="film" className={`${styles.band}${context === 'page' ? ` ${styles.page}` : ''}`} data-surface="chamber" aria-labelledby="film-title">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(filmJsonLd(BRAND.url)).replace(/</g, '\\u003c') }} />
      <div className={styles.inner}>
        <div className={styles.head}>
          <div className={styles.headRule}>
            <span className={styles.headCross} aria-hidden="true" />
            <span className="t-label">{archived ? 'The launch film' : 'The film'}</span>
            <span className={styles.headNote}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6" /></svg>
              1:00, sound on
            </span>
          </div>
          <Heading id="film-title" className={styles.title}>Sixty seconds, <em>on the record.</em></Heading>
          <p className={styles.lede}>
            One real hire on BSC mainnet, from the question to an answer checked against the chain. Then an agent you build, an assistant that hires for you, and the quest.
          </p>
        </div>

        <FilmPlayer />

        <div className={styles.foot}>
          <Limits label="What is real in this film">
            <ul className={styles.limitsList}>
              <li>The hire is <a href="/jobs/56/56903">job 56903</a>: Keel, a Marque reference agent, paid by an outside buyer on BSC mainnet. Its answer, checks and transactions are the real ones, and the frame links to them while it plays.</li>
              <li>The registry figures at the start were measured on {FILM.measured}. {context === 'home' ? 'The live record is just below.' : <>The live record is on the <a href="/#record">home page</a>.</>}</li>
              <li>The build and assistant chapters show an illustrative agent and chat. The steps, tools and checks are the real ones, on BSC testnet.</li>
              <li>{archived
                ? <>This is the film as posted on 27 Oct 2026. Set and Earn closed on Thu 5 Nov, 12:00 UTC.</>
                : <>The countdown is today&apos;s. Each day has its own cut, timed to the close on Thu 5 Nov, 12:00 UTC, so the film and the Set and Earn clock always agree.</>}</li>
            </ul>
          </Limits>
          <details className={styles.transcript} open={context === 'page' || undefined}>
            <summary>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              Read the film
            </summary>
            <p className={styles.transcriptNote}>The film has no narration. Every word on screen is here, in order. A time plays the film from there.</p>
            <ol className={styles.tList}>
              {CHAPTERS.map((c) => (
                <li key={c.id}>
                  <FilmTime at={c.start} />
                  <div className={styles.tBody}>
                    <h3>{c.title}</h3>
                    {c.lines.map((l) => <p key={l}>{l}</p>)}
                    <span className={styles.tEv}>
                      {c.evidence.provenance ? <span className={`prov prov--${c.evidence.provenance === 'ILLUSTRATIVE' ? 'claimed' : c.evidence.provenance.toLowerCase()}`}>{c.evidence.provenance}</span> : null}
                      {c.evidence.href ? <a href={c.evidence.href}>{c.evidence.label}</a> : c.evidence.label}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </details>
          {context === 'page' ? (
            <p className={`${styles.download} ${styles.wide}`}>
              <a href={mediaUrl(FILM_MEDIA.variants.d9.h264.file)} download="marque-on-the-record.mp4">Download the film as posted on 27 Oct 2026</a>
              <span>(MP4, 1080p, {Math.round(FILM_MEDIA.variants.d9.h264.bytes / 1e6)} MB)</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
