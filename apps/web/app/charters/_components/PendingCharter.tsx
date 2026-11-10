'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
export function PendingCharter() {
  const router = useRouter()
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (tries >= 20) return
    const timer = setTimeout(() => { setTries(n => n + 1); router.refresh() }, 3000)
    return () => clearTimeout(timer)
  }, [router, tries])
  return <section role="status"><h1>Checking your charter</h1><p>The read network is catching up with your grant. This page checks again automatically.</p><button className="btn btn--primary" type="button" onClick={() => { setTries(0); router.refresh() }}>Read again</button><p><a href="/me?tab=charters">My charters</a></p></section>
}
