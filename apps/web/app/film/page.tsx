import type { Metadata } from 'next'
import { BRAND } from '@marque/ui/brand'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { FilmSection } from '../_components/film/FilmSection'
import { FILM, mediaUrl } from '../../lib/film'
import { FILM_MEDIA } from '../../lib/film-media'

/** /film: the launch film on its own page, to share and to read. Same section as the home page. */
export const revalidate = 300

const poster = FILM_MEDIA.poster.jpg[FILM_MEDIA.poster.jpg.length - 1]!
const description = 'One real hire on BNB Chain in sixty seconds: ask, choose on proof, pay into escrow, get an answer checked against the chain. Then build an agent people hire, and the Set and Earn quest.'

export const metadata: Metadata = {
  title: 'The film',
  description,
  alternates: { canonical: '/film' },
  openGraph: {
    title: `${FILM.name}`,
    description,
    url: `${BRAND.url}/film`,
    type: 'video.other',
    images: [{ url: mediaUrl(poster.file), width: 1920, height: 1080, alt: 'Marque: Hire an agent. Check its work.' }],
    videos: [{ url: `${BRAND.url}${mediaUrl(FILM_MEDIA.variants.d9.h264.file)}`, secureUrl: `${BRAND.url}${mediaUrl(FILM_MEDIA.variants.d9.h264.file)}`, type: 'video/mp4', width: 1920, height: 1080 }],
  },
  twitter: { card: 'summary_large_image', title: FILM.name, description, images: [mediaUrl(poster.file)] },
}

export default function FilmPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ width: '100%', maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 var(--margin)' }}>
        <FilmSection context="page" />
      </main>
      <SiteFooter />
    </>
  )
}
