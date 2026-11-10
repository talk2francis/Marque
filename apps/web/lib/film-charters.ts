import { BRAND } from '@marque/ui/brand'
import { CHARTERS_MEDIA } from './film-media'
import { chaptersVtt, mediaUrl, type FilmChapter, type FilmDefinition } from './film'

const illustration = { provenance: 'ILLUSTRATIVE' as const, label: 'Example settings and simulated paths', href: '/docs/charters' }
export const CHARTERS_CHAPTERS: readonly FilmChapter[] = [
  { id: 'problem', title: 'The problem', start: 0, end: 6,
    lines: ['AI agents can act for you now. With your money.', 'Your wallet. No limits. No receipts. No off switch.', 'So draw the line.'], evidence: illustration },
  { id: 'charters', title: 'Charters', start: 6, end: 10,
    lines: [`New on ${BRAND.name}. Charters.`, 'Agents that act for you, inside lines you draw.', 'Four kinds. Live on BNB Chain.'], evidence: illustration },
  { id: 'loan', title: 'Loan Guard', start: 10, end: 18,
    lines: ['Loan Guard, with Keel.', 'If my loan health falls below 1.30, repay it back to 1.80.', '1.30 your line. 1.80 back to here. 1.00 liquidation.', 'Health. Your wallet. Keel repays. Into your loan, nowhere else.'],
    evidence: { ...illustration, href: '/charters/new?kind=loan' } },
  { id: 'yield', title: 'Yield Sweep', start: 18, end: 24,
    lines: ['Yield Sweep, with Sluicegate.', 'Keep my wallet between 200 and 600. Put the rest to work.', '600 ceiling. 200 floor. Wallet.', 'Above the ceiling: put to work. Below the floor: topped up.', 'Earning in Venus, in your name.'],
    evidence: { ...illustration, href: '/charters/new?kind=yield' } },
  { id: 'grid', title: 'Grid Band', start: 24, end: 30,
    lines: ['Grid Band, with Lattice.', 'Buy every dip. Sell one step higher.', '$720 highest level. $560 lowest level. Buy. Sell.', 'Round trips. None returns less than it spent.'], evidence: { ...illustration, href: '/charters/new?kind=grid' } },
  { id: 'range', title: 'Range Keeper', start: 30, end: 36,
    lines: ['Range Keeper, with Bound.', 'Keep my position in range, without watching.', 'Top of your range. Bottom of your range.', 'Bound moves it. Same width.', 'Inside your loss limit, or it cancels.', 'Moves used, of 10. Same width, every time.'], evidence: { ...illustration, href: '/charters/new?kind=range' } },
  { id: 'sentence', title: 'You sign one sentence', start: 36, end: 40,
    lines: ['You sign one sentence. Your charter.', 'If my loan health falls below 1.30, repay my USDT loan back to 1.80, using up to 500 USDT from my wallet, until 8 Dec.', 'Charter granted. Your money has not moved.'], evidence: illustration },
  { id: 'key', title: "The agent's key", start: 40, end: 46,
    lines: ['The agent gets a key. Not your wallet.', 'Keel. The agent. Your charter. One contract, yours.', 'Session key, by Altana. Can call: act(). On: this charter only. Until: the day it ends. On the record: Altana KeyStore.', 'Keel, Lattice and Bound act through Altana session keys. Anyone can check them on chain.'],
    evidence: { ...illustration, label: 'Illustrated key scope; read how it works', href: '/docs/faq#what-is-an-agent-s-altana-key' } },
  { id: 'end', title: 'End it', start: 46, end: 50,
    lines: ['End it in one step.', 'Revoked. The key is revoked. It can never act again.'], evidence: illustration },
  { id: 'rules', title: 'The rules', start: 50, end: 54,
    lines: ['Your limits are code.', 'The chain decides when.', 'End it in one step.', 'Every action, on the record.'], evidence: illustration },
  { id: 'four', title: 'Four charters', start: 54, end: 58,
    lines: ['Four charters. Live on BNB Chain.', 'Loan Guard, with Keel. Keeps your Venus loan healthy. Yield Sweep, with Sluicegate. Idle money earns, in your name. Grid Band, with Lattice. Buys dips, sells one step up. Range Keeper, with Bound. Keeps your position in range. Live.', 'One job each. Lifetime limits you set. End any of them in one step.'],
    evidence: { provenance: 'ONCHAIN', label: 'Current counts by kind and network', href: '/charters#kinds-h' } },
  { id: 'marque', title: BRAND.name, start: 58, end: 66,
    lines: [BRAND.name, 'Agents that act for you, inside lines you draw.', 'Loan Guard. Yield Sweep. Grid Band. Range Keeper.', `${BRAND.domain}/charters`, 'Agent keys by Altana. Loans on Venus. Pools on PancakeSwap. Live on BNB Chain.', 'Charters are new and unaudited. Not investment advice.'], evidence: illustration },
]

export const CHARTERS_FILM: FilmDefinition = {
  id: 'charters', title: 'Draw the line', name: `${BRAND.name}: Draw the line`, duration: 66,
  media: CHARTERS_MEDIA, chapters: CHARTERS_CHAPTERS, variant: () => 'main',
  chaptersUrl: '/charters/chapters.vtt', pageUrl: '/film?film=charters#charters-film',
  cta: () => ({ from: 62, left: 31, top: 76.5, width: 38, height: 7, visible: true, href: '/charters/new?kind=loan', label: 'Grant a charter' }),
}
export const chartersChaptersVtt = () => chaptersVtt(CHARTERS_CHAPTERS)
export function chartersFilmJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org', '@type': 'VideoObject', name: CHARTERS_FILM.name,
    description: 'Four bounded charters on BNB Chain, explained with illustrative settings and simulated paths. New and unaudited; current counts are on the Charters page.',
    uploadDate: '2026-11-10', duration: 'PT1M6S', inLanguage: 'en',
    thumbnailUrl: [origin + mediaUrl(CHARTERS_MEDIA.og.file)],
    contentUrl: origin + mediaUrl(CHARTERS_MEDIA.variants['main']!.h264.file), embedUrl: origin + CHARTERS_FILM.pageUrl,
    hasPart: CHARTERS_CHAPTERS.map(c => ({ '@type': 'Clip', name: c.title, startOffset: c.start, endOffset: c.end, url: `${origin}/film?film=charters&t=${c.start}#charters-film` })),
  }
}
