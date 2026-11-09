/** The documentation library: one list, read by the docs rail, the nav menu and the footer. */
export const LIBRARY: Array<{ slug: string; href: string; label: string }> = [
  { slug: 'guide', href: '/docs', label: 'How to use Marque' },
  { slug: 'developers', href: '/docs/developers', label: 'Developer read client' },
  { slug: 'sellers', href: '/docs/sellers', label: 'Seller setup and recovery' },
  { slug: 'mcp', href: '/docs/mcp', label: 'Marque for agents (MCP)' },
  { slug: 'faq', href: '/docs/faq', label: 'Questions, answered' },
  { slug: 'whitepaper', href: '/docs/whitepaper', label: 'Whitepaper' },
  { slug: 'delivery-status', href: '/docs/delivery-status', label: 'V3 delivery status' },
  { slug: 'changelog', href: '/docs/changelog', label: 'Changelog' },
  { slug: 'risks', href: '/docs/risks', label: 'Risk disclosure' },
  { slug: 'terms', href: '/docs/terms', label: 'Terms of use' },
  { slug: 'privacy', href: '/docs/privacy', label: 'Privacy' },
]

/** Charters' two guides join the library once CHARTERS_PUBLIC is on (AGENTS.md section 14), or on their own pages. */
const CHARTER_DOCS = [
  { slug: 'charters', href: '/docs/charters', label: 'Charters' },
  { slug: 'charters-dev', href: '/docs/developers/charters', label: 'Charters for builders' },
]
export function libraryFor(current: string, env: Record<string, string | undefined> = process.env) {
  if (env['CHARTERS_PUBLIC'] !== '1' && !current.startsWith('charters')) return LIBRARY
  const i = LIBRARY.findIndex((l) => l.slug === 'mcp') + 1
  return [...LIBRARY.slice(0, i), ...CHARTER_DOCS, ...LIBRARY.slice(i)]
}
