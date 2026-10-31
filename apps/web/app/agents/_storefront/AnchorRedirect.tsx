'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Old one-page anchors (#sf-verify, #evidence, ...) move to their routed section (SPEC-WORKSPACE 3.1). */
const MAP: Record<string, string> = {
  'sf-verify': '/evidence', evidence: '/evidence', verification: '/evidence',
  'sf-track': '/record', record: '/record', track: '/record', ratings: '/record', activity: '/record',
  'sf-how': '/terms', 'sf-perm': '/terms', terms: '/terms', permissions: '/terms',
  'sf-id': '/technical', technical: '/technical', identity: '/technical',
}

export function AnchorRedirect({ base }: { base: string }) {
  const router = useRouter()
  useEffect(() => {
    const to = MAP[window.location.hash.slice(1)]
    if (to) router.replace(`${base}${to}${window.location.search}`, { scroll: false })
  }, [base, router])
  return null
}
