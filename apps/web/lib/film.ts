import { campaignClock } from '@marque/commerce/rules'
import { FILM_MEDIA, type FilmVariantKey } from './film-media'

/**
 * "On the record", the 60-second launch film (27 Oct 2026), as the product shows it.
 *
 * One source for the player, the chapter rail, the transcript, the chapters track, the
 * structured data and the tests. The media files live outside the app (Caddy serves
 * /media/film/ from disk, immutable, content-hashed); lib/film-media.ts is their manifest.
 *
 * Truth rules (AGENTS.md invariants 4, 5, 17, 20):
 * - The countdown in the film is always today's. Every day count from 9 to 1 has its own
 *   cut, plus a "final 24 hours" cut, chosen by the same clock as the Campaign Dock, so the
 *   film and the Dock never disagree. After the close the film is the one posted on 27 Oct,
 *   labelled as such.
 * - The figures at the start were measured on 25 and 26 Oct 2026, and are labelled with
 *   that date wherever the film is shown. The live record sits below it on the home page.
 * - Job 56903 is a real, paid hire on BSC mainnet; the film links to it while it plays.
 * - "Your agent" and its hires in the build chapter are illustrative, and say so.
 */

export const FILM = {
  title: 'On the record',
  name: 'Marque: On the record',
  duration: 60,
  /** When the film was first posted (the X post). */
  posted: '2026-10-27',
  /** When the registry figures in the film were measured. */
  measured: '25 and 26 Oct 2026',
  /** The end card's "Start the Set and Earn quest", in percent of the frame (measured from the film source at 56.5 s). */
  cta: { from: 55.8, left: 32.08, top: 66.3, width: 22.34, height: 6.3 },
  /** The end card holds from here; the poster frame is at 7.3 s. */
  endCard: 55.8,
  posterAt: 7.3,
} as const

export type Provenance = 'ONCHAIN' | 'MEASURED' | 'TESTED' | 'CLAIMED' | 'ILLUSTRATIVE'

export interface FilmChapter {
  id: string
  title: string
  start: number
  end: number
  /** What is on screen, in order, word for word (the film has no narration). */
  lines: readonly string[]
  /** What this chapter shows, and how real it is. Shown on the frame while it plays. */
  evidence: { provenance: Provenance | null; label: string; href: string | null }
}

export const CHAPTERS: readonly FilmChapter[] = [
  {
    id: 'question', title: 'The question', start: 0, end: 8,
    lines: [
      '390,000+ agents on BNB Chain. Registered: 390,236.',
      'Which ones actually work? Answer a live call: 42,266.',
      'Hire the ones that prove it. Pass the published test: 12.',
      'Marque. Hire an agent. Check its work.',
    ],
    evidence: { provenance: 'MEASURED', label: 'Measured 25 and 26 Oct 2026', href: '/why' },
  },
  {
    id: 'ask', title: 'Ask', start: 8, end: 12,
    lines: ['Ask in plain words.', 'Typed: "Keep my Venus loan safe". Get quotes.', 'Agents that fit reply with a price they signed.'],
    evidence: { provenance: 'ONCHAIN', label: 'Job 56903, BSC mainnet', href: '/jobs/56/56903' },
  },
  {
    id: 'choose', title: 'Choose', start: 12, end: 16,
    lines: [
      'Choose on proof. A live price. A public test. Terms in writing.',
      'Keel, health factor, a Marque reference agent. 0.05 U, a live quote signed by the agent. Delivers in 13 s (median of escrow-funded jobs).',
      'Warranted, MCS-HF-1: passed 5 of 5 assertions.',
      'Terms in the job, agreed before you pay: health factor within 0.005 of Venus at the answer’s block; the repay amount reaches the target within 0.005; liquidation price within 1 percent of Venus prices.',
    ],
    evidence: { provenance: 'ONCHAIN', label: 'Job 56903, BSC mainnet', href: '/jobs/56/56903' },
  },
  {
    id: 'pay', title: 'Pay', start: 16, end: 20,
    lines: [
      'No wallet? Use your face. A Marque Pass. Nothing to install.',
      'Your money waits. Held in BNB Chain escrow until the work lands.',
      '0.05 U to escrow (ERC-8183).',
    ],
    evidence: { provenance: 'ONCHAIN', label: 'Job 56903, BSC mainnet', href: '/jobs/56/56903' },
  },
  {
    id: 'deliver', title: 'Deliver', start: 20, end: 24,
    lines: [
      'The answer, as a picture. Its hash goes on chain the moment it lands.',
      'Health factor 2.437, at or above the 2 target. Repay to reach 2: nothing. SolvBTC liquidates at $35,090.09.',
    ],
    evidence: { provenance: 'ONCHAIN', label: 'Job 56903, BSC mainnet', href: '/jobs/56/56903' },
  },
  {
    id: 'check', title: 'Check', start: 24, end: 28,
    lines: [
      'Checked. Then paid. Marque re-reads the chain at the answer’s block.',
      'Checked against the chain: 3 of 3 agree. File matches the hash on chain.',
    ],
    evidence: { provenance: 'ONCHAIN', label: 'Job 56903, BSC mainnet', href: '/jobs/56/56903' },
  },
  {
    id: 'receipts', title: 'Receipts', start: 28, end: 30,
    lines: [
      'Every job, who paid.',
      '#56903, mainnet, Keel, outside buyer, paid out, 3 of 3 agree. #57066, mainnet, Keel, Marque team (test), delivered. #1670, testnet, Keel, Marque team (test), paid out, 3 of 3 agree.',
      'Team test jobs are listed and labelled, never counted.',
    ],
    evidence: { provenance: 'ONCHAIN', label: 'Every job, who paid', href: '/proof' },
  },
  {
    id: 'build', title: 'Build', start: 30, end: 40,
    lines: [
      'Forge an agent buyers can hire. BSC testnet, free.',
      'Scaffold, strategy, host, register on ERC-8004, check against the Standard, listed on Marque.',
      'Your wallet signs. Your server runs it. Then people you don’t know hire it.',
      'Every check Set and Earn asks for, on one page.',
    ],
    evidence: { provenance: 'ILLUSTRATIVE', label: 'Your agent and its hires are illustrative', href: '/builders' },
  },
  {
    id: 'automate', title: 'Automate', start: 40, end: 44,
    lines: [
      'Your AI can hire too. Marque’s MCP server: 11 tools, no keys.',
      '"Find a health factor agent and plan the hire." tender: Keel, 0.05 U, signed quote. plan_hire: five unsigned steps, from opening the job to paying 0.05 U into escrow.',
      'Marque never signs. You do.',
    ],
    evidence: { provenance: 'ILLUSTRATIVE', label: 'The chat is illustrative; the tools are real', href: '/docs/mcp' },
  },
  {
    id: 'agents', title: 'The agents', start: 44, end: 46,
    lines: ['Keel, health factor. Sluicegate, yield. Lattice, grid trading. Bound, rebalancing. Redcell, security. Tidemark, yield.'],
    evidence: { provenance: null, label: 'Marque reference agents', href: '/register' },
  },
  {
    id: 'quest', title: 'The quest', start: 46, end: 60,
    lines: [
      'Set and Earn. Hire three. Build one.',
      'The days left, counted to the close. Practice hires are free on BSC testnet.',
      'Closes Thu 5 Nov, 12:00 UTC.',
      'Hire an agent. Check its work. Start the Set and Earn quest. marque.trade',
    ],
    evidence: { provenance: null, label: 'Set and Earn closes Thu 5 Nov, 12:00 UTC', href: '/quest' },
  },
] as const

/** The chapter playing at `t` seconds (the last one once the film ends). */
export function chapterAt(t: number): FilmChapter {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) if (t >= CHAPTERS[i]!.start) return CHAPTERS[i]!
  return CHAPTERS[0]!
}

/**
 * The cut to play now: the one whose countdown is true at `nowMs`, by the Campaign Dock's
 * clock (whole days left, floored, so "8 days left" plays while the Dock reads 8d and some
 * hours). Under a day left, the final-24-hours cut. After the close, the film as posted.
 */
export function filmVariant(nowMs: number): FilmVariantKey {
  const c = campaignClock(nowMs)
  if (c.closed || c.days >= 9) return 'd9'
  return `d${c.days}` as FilmVariantKey
}

/** True once Set and Earn has closed: the film is then shown as the dated launch film. */
export function filmArchived(nowMs: number): boolean {
  return campaignClock(nowMs).closed
}

export const mediaUrl = (file: string) => `${FILM_MEDIA.base}${file}`

/** The poster as <picture> sources, widest last. */
export function posterSources() {
  const set = (list: ReadonlyArray<{ w: number; file: string }>) => list.map((p) => `${mediaUrl(p.file)} ${p.w}w`).join(', ')
  return {
    avif: set(FILM_MEDIA.poster.avif),
    webp: set(FILM_MEDIA.poster.webp),
    jpg: set(FILM_MEDIA.poster.jpg),
    fallback: mediaUrl(FILM_MEDIA.poster.jpg[FILM_MEDIA.poster.jpg.length - 1]!.file),
  }
}

/** m:ss */
export const clock = (s: number) => {
  const v = Math.max(0, Math.floor(s + 1e-6))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

/** WebVTT chapters, served at /film/chapters.vtt for native players. */
export function chaptersVtt(): string {
  const ts = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.000`
  return ['WEBVTT', '', ...CHAPTERS.flatMap((c) => [c.id, `${ts(c.start)} --> ${ts(c.end)}`, c.title, ''])].join('\n')
}

/** schema.org VideoObject for search and link previews: the film as posted. */
export function filmJsonLd(origin: string) {
  const v = FILM_MEDIA.variants.d9
  const posterJpg = FILM_MEDIA.poster.jpg[FILM_MEDIA.poster.jpg.length - 1]!.file
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: FILM.name,
    description: 'One real hire on BNB Chain in sixty seconds: ask, choose on proof, pay into escrow, get an answer checked against the chain. Then build an agent, let your AI hire, and the Set and Earn quest.',
    thumbnailUrl: [`${origin}${mediaUrl(posterJpg)}`],
    uploadDate: `${FILM.posted}T12:00:00Z`,
    duration: 'PT1M',
    contentUrl: `${origin}${mediaUrl(v.h264.file)}`,
    embedUrl: `${origin}/film`,
    inLanguage: 'en',
    hasPart: CHAPTERS.map((c) => ({ '@type': 'Clip', name: c.title, startOffset: c.start, endOffset: c.end, url: `${origin}/film?t=${c.start}` })),
  }
}
