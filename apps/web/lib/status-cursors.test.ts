import { describe, expect, it } from 'vitest'
import { cursorReading } from './status-cursors'

describe('each operational cursor reports its own freshness', () => {
  const now = Date.parse('2026-10-22T03:00:00Z')
  it('does not borrow the newest checkpoint timestamp for an old registry scan', () => {
    expect(cursorReading('scan:list:56', '2026-10-22T00:00:00Z', now)).toMatchObject({ stale: true, text: '3.0 h ago' })
    expect(cursorReading('registry:services-walk', '2026-10-22T02:59:45Z', now)).toMatchObject({ stale: false, text: 'just now' })
  })
  it('uses the existing scan cadence and probe cadence without extending either', () => {
    expect(cursorReading('scan:deep:56', '2026-10-22T01:00:00Z', now).stale).toBe(false)
    expect(cursorReading('scan:deep:56', '2026-10-22T00:59:59Z', now).stale).toBe(true)
    expect(cursorReading('registry:uri-events:56', '2026-10-22T02:40:00Z', now).stale).toBe(false)
    expect(cursorReading('registry:uri-events:56', '2026-10-22T02:39:59Z', now).stale).toBe(true)
  })
  it('does not turn an unreadable timestamp into fresh activity', () => {
    expect(cursorReading('scan:list:56', null, now)).toMatchObject({ stale: true, text: 'unknown' })
  })
})
