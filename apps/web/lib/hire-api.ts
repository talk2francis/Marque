import 'server-only'
import { NextResponse } from 'next/server'
import { HireError } from '@marque/commerce'

/** Plain-words JSON errors for the hire rail. Never echoes driver, RPC or contract text. */
export function hireError(err: unknown, route: string) {
  if (err instanceof HireError) return NextResponse.json({ error: err.code, detail: err.message }, { status: err.status })
  console.error(`[api/v1/hire/${route}]`, err instanceof Error ? err.message : String(err))
  return NextResponse.json({ error: 'hire_unavailable', detail: 'Marque could not complete this step just now. Nothing was charged. Try again in a minute.' }, { status: 503 })
}

export function limited(detail: string | undefined, retry: number | undefined) {
  return NextResponse.json({ error: 'rate_limited', detail }, { status: 429, headers: { 'Retry-After': String(retry ?? 60) } })
}
