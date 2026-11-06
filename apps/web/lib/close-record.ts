import figures from '../../../docs/evidence/set-and-earn-close-2026-11-05/close-figures.json'
import anchor from '../../../docs/evidence/close-anchor-2026-11-06.json'

export const CLOSE_RECORD = { figures, anchor }
export const CLOSE_FILES = [
  'README.md', 'SHA256SUMS', 'close-figures.json', 'proof.json', 'funnel.json', 'coverage-56.json', 'coverage-97.json', 'stats.json',
  'quest/0x0d8c9ad8eebb6879fefa218f0799219bcaabe999.json',
  'quest/0x15a97307caa68c24e4b5a0b83d331a6aa1ea195f.json',
  'quest/0x34d9bfa696b4775341f1b9167af578f5be292766.json',
  'quest/0x5ac2448fc79ef8d33710b1bced5aeff90138b452.json',
  'quest/0x73809f69916fcf7ddc5bb1315fbdf96a569a5963.json',
  'quest/0x7709271a7644b311ca21bb7a38a77be95c793f22.json',
  'quest/0xb833c2ee1d6cee3933a8ab525cc4a1c8f812a6e2.json',
  'quest/0xbfaa69233741924ed5b9d5daa9b4bf7b84567f0a.json',
  'quest/0xda53362d304d7970db19547c52208a35c6d83c8a.json',
] as const
export const closeFileUrl = (file: string) => `/api/v1/record-at-close/${file}`
