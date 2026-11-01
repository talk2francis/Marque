'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Keep the original workspace bookmark useful after moving it out of the Forge. */
export function LegacyWorkspaceRedirect() {
  const router = useRouter()
  useEffect(() => {
    if (window.location.hash === '#your-agents') router.replace(`/builders/my-agents${window.location.search}`)
  }, [router])
  return null
}
