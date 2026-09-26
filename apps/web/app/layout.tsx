import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { BRAND } from '@marque/ui/brand'
import { Suspense } from 'react'
import { WalletProvider } from './_components/WalletProvider'
import { HireSheet } from './_components/HireSheet'
import { Toaster } from './_components/ui/Toaster'
import { THEME_BOOTSTRAP } from '../lib/theme'
import './globals.css'

/**
 * Fonts (DESIGN-SYSTEM.md section 4), self-hosted from apps/web/fonts through
 * next/font/local: no request to a font CDN, so builds are reproducible and the
 * CSP stays tight. Licences: docs/THIRD_PARTY.md.
 */
const generalSans = localFont({
  src: [
    { path: '../fonts/GeneralSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/GeneralSans-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/GeneralSans-Semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--ff-general-sans',
  display: 'swap',
  // Metric-matched (packages/ui/src/base.css), so the swap does not move a line.
  fallback: ['Marque Sans Fallback', 'Hanken Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
})

const instrumentSerif = localFont({
  src: [
    { path: '../fonts/instrument-serif-400-latin.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/instrument-serif-400-italic-latin.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--ff-instrument-serif',
  display: 'swap',
  fallback: ['Iowan Old Style', 'Georgia', 'serif'],
})

const plexMono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-400-latin.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-500-latin.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--ff-plex-mono',
  display: 'swap',
  preload: false,
  fallback: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
})

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
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
    { media: '(prefers-color-scheme: dark)', color: '#0E0F0B' },
    { media: '(prefers-color-scheme: light)', color: '#F2EFE7' },
  ],
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="night" className={`${generalSans.variable} ${instrumentSerif.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <WalletProvider>
          {children}
          <Suspense fallback={null}><HireSheet /></Suspense>
          <Toaster />
        </WalletProvider>
      </body>
    </html>
  )
}
