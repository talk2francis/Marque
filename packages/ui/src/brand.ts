/**
 * The single source of truth for the product's name.
 *
 * AGENTS.md: the display name lives in exactly one place and is imported
 * everywhere, because a product that hardcodes its own name in forty files
 * cannot be rebranded by whoever adopts it. Never inline these strings.
 *
 * Naming discipline: `Marque` is a proper noun and nothing else. The scoped
 * session is a Charter. The conformance certificate is a Warrant. Never write
 * "a marque" or "grant a marque".
 */
export const BRAND = {
  name: 'Marque',
  domain: 'marque.trade',
  url: 'https://marque.trade',
  tagline: 'Put your BNB Chain positions in the hands of agents you can hold to account.',
  chain: 'BNB Smart Chain',
} as const

/** Product vocabulary. Used in copy so the terms never drift between screens. */
export const VOCAB = {
  desk: 'the Desk',
  register: 'the Register',
  charter: 'a Charter',
  warrant: 'a Warrant',
  ledger: 'the Ledger',
  standard: 'MCS',
  standardLong: 'Marque Conformance Standard',
} as const
