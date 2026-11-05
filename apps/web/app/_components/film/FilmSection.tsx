import { Limits } from '@marque/ui'
import { BRAND } from '@marque/ui/brand'
import { CHAPTERS, FILM, filmAfter, filmJsonLd, mediaUrl } from '../../../lib/film'
import { FILM_MEDIA } from '../../../lib/film-media'
import { FilmPlayer } from './FilmPlayer'
import { FilmTime } from './FilmCue'
import { FilmFold } from './FilmFold'
import styles from './film.module.css'

/**
 * The screening room: the launch film in a Chamber band, with what is real in it and every
 * word of it. Home (under the hero) and /film use the same section; /film opens the words and
 * offers the file.
 */
export function FilmSection({ context }: { context: 'home' | 'page' }) {
  const after = filmAfter(Date.now())
  const Heading = context === 'page' ? 'h1' : 'h2'
  const limits = (
    <Limits label="What is real in this film">
      <ul className={styles.limitsList}>
        <li>The hire is <a href="/jobs/56/56903">job 56903</a>: Keel, a Marque reference agent, paid by an outside wallet on BSC mainnet: a builder whose agents are also listed here. Its answer, checks and transactions are the real ones, and the frame links to them while it plays.</li>
        <li>{after
          ? <>Every figure in it was read from Marque&apos;s public record at {FILM.after.measured}: the registry count, the agents answering and checked, and every job on BSC mainnet from 1 Oct to the close.</>
          : <>The registry figures at the start were measured on {FILM.measured}.</>} {context === 'home' ? 'The live record is just below.' : <>The live record is on the <a href="/#record">home page</a>.</>}</li>
        {after ? <li>&ldquo;Outside hires&rdquo; are BSC mainnet jobs paid by wallets that are not in Marque&apos;s published team list: {FILM.after.record.outsideMainnet} from {FILM.after.record.outsideWallets} wallets, {FILM.after.record.outsideAlsoOperator} of them from wallets that also run agents listed here. Team test jobs are shown, hollow, and never counted. Those figures were read at 12:00:24 UTC; two more outside jobs, 57188 and 57189, were created in the last three minutes before the close and indexed after that read, so the record lists {FILM.after.record.outsideMainnet + 2}. <a href="/proof">Every job, who paid</a>.</li> : null}
        <li>The build and assistant chapters show an illustrative agent and chat. The steps, tools and checks are the real ones, on BSC testnet.</li>
        <li>{after
          ? <>The launch film, with the Set and Earn countdown, was posted on 27 Oct 2026{context === 'page' ? '; it is still below to download' : ''}. This cut has played since Set and Earn closed on Thu 5 Nov, 12:00 UTC.</>
          : <>The countdown is today&apos;s. Each day has its own cut, timed to the close on Thu 5 Nov, 12:00 UTC, so the film and the Set and Earn clock always agree.</>}</li>
      </ul>
    </Limits>
  )
  const ld = <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(filmJsonLd(BRAND.url)).replace(/</g, '\\u003c') }} />
  const inner = (
      <div className={styles.inner}>
        <div className={styles.head}>
          <div className={styles.headRule}>
            <span className={styles.headCross} aria-hidden="true" />
            <span className="t-label">The film</span>
            <span className={styles.headNote}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6" /></svg>
              1:00, sound on
            </span>
          </div>
          <Heading id="film-title" className={styles.title}>Sixty seconds, <em>on the record.</em></Heading>
          <p className={styles.lede}>
            One real hire on BSC mainnet, from the question to an answer checked against the chain. Then an agent you build, an assistant that hires for you, and {after ? 'the record Set and Earn left' : 'the quest'}.
          </p>
        </div>

        <FilmPlayer />

        <div className={styles.foot}>
{limits}
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
              {after ? <><a href={mediaUrl(FILM_MEDIA.variants.after.h264.file)} download="marque-on-the-record.mp4">Download the film</a>
              <span>(MP4, 1080p, {Math.round(FILM_MEDIA.variants.after.h264.bytes / 1e6)} MB)</span>{' · '}</> : null}
              <a href={mediaUrl(FILM_MEDIA.variants.d9.h264.file)} download="marque-on-the-record-launch.mp4">Download the launch film as posted on 27 Oct 2026</a>
              <span>(MP4, 1080p, {Math.round(FILM_MEDIA.variants.d9.h264.bytes / 1e6)} MB)</span>
            </p>
          ) : null}
        </div>
      </div>
  )
  // On the home page the film waits folded in one quiet line (28 Oct), so the page stays about hiring agents;
  // it opens in place, and the hero's "Watch the film" opens it and plays.
  if (context === 'home') {
    // Opened, a room in two parts: the screen at about two thirds, and beside it the chapters (each plays from its
    // time), what is real in the film, and the way to every word. The fold line above carries the title.
    return (
      <section id="film" className={styles.fold} aria-label="The film">
        {ld}
        <FilmFold>
          <div className={`${styles.band} ${styles.bandHome}`} data-surface="chamber">
            <div className={`${styles.inner} ${styles.split}`}>
              <div className={styles.splitMain}><FilmPlayer /></div>
              <aside className={styles.splitSide} aria-label="About the film">
                <ol className={styles.sideChapters} aria-label="Chapters">
                  {CHAPTERS.map((c) => <li key={c.id}><FilmTime at={c.start} /><span>{c.title}</span></li>)}
                </ol>
                {limits}
                <a className={styles.sideMore} href="/film">Every word of the film, and the file</a>
              </aside>
            </div>
          </div>
        </FilmFold>
      </section>
    )
  }
  return (
    <section id="film" className={`${styles.band} ${styles.page}`} data-surface="chamber" aria-labelledby="film-title">
      {ld}
      {inner}
    </section>
  )
}
