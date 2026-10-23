'use client'
import { useEffect } from 'react'

/** Old one-page anchors (#sf-verify, #evidence, ...) move to their routed section (SPEC-WORKSPACE 3.1). */
const MAP: Record<string, string> = {
  'sf-verify': '/evidence', evidence: '/evidence', verification: '/evidence',
  'sf-track': '/record', record: '/record', track: '/record', ratings: '/record', activity: '/record',
  'sf-how': '/terms', 'sf-perm': '/terms', terms: '/terms', permissions: '/terms',
  'sf-id': '/technical', technical: '/technical', identity: '/technical',
}

export function AnchorRedirect({ base }: { base: string }) {
  useEffect(() => {
    const to = MAP[window.location.hash.slice(1)]
    if (to) window.location.replace(`${base}${to}${window.location.search}`)
  }, [base])
  return null
}
