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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f1e9' },
    { media: '(prefers-color-scheme: dark)', color: '#101109' },
  ],
  width: 'device-width',
  initialScale: 1,
}

/**
 * Set the theme before first paint so there is no flash. Reads an explicit
 * choice from localStorage; otherwise leaves it to the OS preference (the CSS
 * handles that). Deliberately tiny and synchronous.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('marque-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`

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
