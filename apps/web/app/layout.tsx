import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Fraunces } from 'next/font/google'
import { BRAND } from '@marque/ui/brand'
import { Reveal } from './_components/Reveal'
import { WalletProvider } from './_components/WalletProvider'
import './globals.css'

/**
 * Fonts are self-hosted by next/font at build time, so the page makes no
 * request to a font CDN. That keeps the CSP strict and the LCP budget intact.
 */
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  // Variable font: axes require weight to be variable/omitted. The single
  // weight and the SOFT/WONK settings are pinned in tokens.css (.statement).
  axes: ['SOFT', 'WONK'],
  variable: '--font-fraunces',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s — ${BRAND.name}` },
  description: BRAND.tagline,
  metadataBase: new URL(BRAND.url),
  applicationName: BRAND.name,
  openGraph: {
    title: BRAND.name,
    description: BRAND.tagline,
    url: BRAND.url,
    siteName: BRAND.name,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND.name,
    description: BRAND.tagline,
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  // Night is the product default, so the browser chrome matches it out of the box.
  themeColor: '#101109',
  width: 'device-width',
  initialScale: 1,
}
// Dark is the default. A visitor who has explicitly chosen light keeps it
// (stored); everyone else — every judge landing cold — gets night, which is the
// theme the product was designed around. The attribute is set before first
// paint so there is no flash.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('marque-theme');document.documentElement.setAttribute('data-theme',(t==='light'||t==='dark')?t:'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="no-js">
        <WalletProvider>
          {children}
          <Reveal />
        </WalletProvider>
      </body>
    </html>
  )
}
