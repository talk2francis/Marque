# Third-party assets

Assets shipped in the web app that were not made for Marque, with their licences. Font files are
self-hosted from `apps/web/fonts/` through `next/font/local` (no font CDN at build or page load).

## Fonts

| Family | Weights and styles shipped | Source | Licence | Where the licence lives |
|---|---|---|---|---|
| General Sans | 400, 500, 600 (woff2) | Indian Type Foundry, via Fontshare (fontshare.com) | ITF Free Font License (FFL) 2.0: free for personal and commercial use, including self-hosted web embedding; the font files may not be sold or redistributed on their own | `apps/web/fonts/GeneralSans-LICENSE.txt` |
| Instrument Serif | 400 regular and italic, latin subset (woff2) | Instrument, via Google Fonts | SIL Open Font License 1.1 | https://openfontlicense.org (OFL text); family page fonts.google.com/specimen/Instrument+Serif |
| IBM Plex Mono | 400, 500, latin subset (woff2) | IBM, via Google Fonts | SIL Open Font License 1.1 | https://openfontlicense.org (OFL text); family page fonts.google.com/specimen/IBM+Plex+Mono |

Fallback stacks: General Sans falls back to a metric-matched local Arial face (`Marque Sans Fallback`,
defined in `packages/ui/src/base.css`), then Hanken Grotesk if installed, then the system UI font.

The Phase 1 families (Geist, Geist Mono, Fraunces; all SIL OFL 1.1) were removed once every route was
checked in the new families (P2-07).

## Icons

| Package | Licence |
|---|---|
| lucide-react | ISC |

## Brand artwork

The Marque mark, wordmark and hero art are Marque's own (Francis, `brand-assets/`). The vector
wordmark and lockup in `apps/web/app/_components/brand/Wordmark.tsx` are potrace outlines of that
artwork (`scripts/trace-brand.sh`).
