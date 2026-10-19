import type { Engine } from '@marque/agent-engines'

const unavailable = 'Could not read chain observations. Retry after a short pause.'

function publicObservation(value: unknown, field = ''): unknown {
  if (typeof value === 'string' && /^(error|reason|need)$/.test(field) && /https?:\/\/|wss?:\/\//i.test(value)) return unavailable
  if (Array.isArray(value)) return value.map(item => publicObservation(item))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicObservation(item, key)]))
  return value
}

/** Keep private RPC URLs out of every public rail using this same read engine. */
export function publicReadEngine(engine: Engine): Engine {
  return {
    ...engine,
    async run(prompt, opts) {
      try {
        return publicObservation(await engine.run(prompt, opts)) as Record<string, unknown>
      } catch {
        return { error: unavailable }
      }
    },
  }
}
