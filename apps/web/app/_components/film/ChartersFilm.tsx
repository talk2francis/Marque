import { Limits } from '@marque/ui'
import { BRAND } from '@marque/ui/brand'
import { CHARTERS_CHAPTERS, chartersFilmJsonLd } from '../../../lib/film-charters'
import { CHARTERS_MEDIA } from '../../../lib/film-media'
import { mediaUrl } from '../../../lib/film'
import { ChartersFilmPlayer } from './ChartersFilmPlayer'
import { FilmTime } from './FilmCue'
import styles from './film.module.css'

/** One player, with the home screening-room layout on the hub and the existing archive entry. */
export function ChartersFilm({ archive = false }: { archive?: boolean }) {
  const ld = <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(chartersFilmJsonLd(BRAND.url)).replace(/</g, '\\u003c') }} />
  const limits = (
    <Limits label="What is real in this film">
      <ul className={styles.limitsList}>
        <li>The numbers are example settings, not results. The wallet counter, price paths, trades and moves are simulations.</li>
        <li>The four rules and the key rows explain the product&apos;s limits. Keel, Lattice and Bound use Altana keys; Sluicegate sends directly.</li>
        <li>Current armed counts and actions are <a href="/charters#kinds-h">on this page by network</a>. The film is not a live counter or evidence that every kind has acted on mainnet.</li>
        <li>Charters are new and unaudited. A Loan Guard cannot guarantee against liquidation; grids hold inventory in a fall; a kept range can underperform holding.</li>
      </ul>
    </Limits>
  )
  const transcript = (
    <details className={styles.transcript} open={archive || undefined}>
      <summary>Read the Charters film</summary>
      <p className={styles.transcriptNote}>On-screen words, in order. Animated readouts are illustrative; these are not wallet balances or trading results.</p>
      <ol className={styles.tList}>{CHARTERS_CHAPTERS.map(c => <li key={c.id}>
        <FilmTime at={c.start} filmId="charters" />
        <div className={styles.tBody}><h3>{c.title}</h3>{c.lines.map(l => <p key={l}>{l}</p>)}
          <span className={styles.tEv}><span className={`prov prov--${c.evidence.provenance === 'ILLUSTRATIVE' ? 'claimed' : 'onchain'}`}>{c.evidence.provenance}</span><a href={c.evidence.href!}>{c.evidence.label}</a></span>
        </div>
      </li>)}</ol>
    </details>
  )
  if (!archive) return (
    <section id="charters-film-hero" className={`${styles.band} ${styles.bandHome} ${styles.chartersBand}`} data-surface="chamber" aria-label="Charters film">
      {ld}
      <div className={`${styles.inner} ${styles.split}`}>
        <div className={styles.splitMain}>
          <ChartersFilmPlayer />
          <p className={styles.chartersMeta}>1:06 · sound on</p>
        </div>
        <aside className={styles.splitSide} aria-label="About the Charters film">
          <ol className={styles.sideChapters} aria-label="Chapters">
            {CHARTERS_CHAPTERS.map(c => <li key={c.id}><FilmTime at={c.start} filmId="charters" /><span>{c.title}</span></li>)}
          </ol>
          {limits}
          {transcript}
        </aside>
      </div>
    </section>
  )
  return <section id="charters-film" className={styles.chartersFilm} aria-label="Charters film">
    <h2>Draw the line</h2>
    {ld}
    <ChartersFilmPlayer />
    <p className={styles.chartersMeta}>1:06 · sound on</p>
    {limits}
    {transcript}
    <p className={styles.download}><a href={mediaUrl(CHARTERS_MEDIA.variants['main']!.h264.file)} download="marque-charters-draw-the-line.mp4">Download the Charters film</a> <span>(MP4, 1080p60, {Math.round(CHARTERS_MEDIA.variants['main']!.h264.bytes / 1e6)} MB)</span></p>
  </section>
}
