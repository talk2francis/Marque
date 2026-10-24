'use client'
import { useEffect, useState } from 'react'
import { ageWords } from '@marque/commerce/words'

/**
 * The age of a measurement. The server (and hydration) render the absolute UTC time; after
 * mount it reads as relative, so a cached page says "checked 52 min ago" honestly instead of
 * an hour-old clock time that looks current. Refreshes every 30 s while open.
 */
export function SnapshotAge({ iso, bare = false }: { iso: string; bare?: boolean }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const rel = now === null ? null : ageWords(iso, now)
  const abs = `${iso.slice(11, 16)} UTC`
  return (
    <time dateTime={iso} title={`${iso.replace('T', ' ').slice(0, 19)} UTC`}>
      {bare ? (rel ?? `at ${abs}`) : rel ? `, checked ${rel}` : ` at ${abs}`}
    </time>
  )
}
