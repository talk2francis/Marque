import { describe, expect, it } from 'vitest'
import { HostBreaker } from './worker'

describe('HostBreaker', () => {
  it('opens for a host that has not answered once and failed three times', () => {
    const b = new HostBreaker()
    b.record('down.example', true)
    b.record('down.example', true)
    expect(b.open('down.example')).toBe(false)
    b.record('down.example', true)
    expect(b.open('down.example')).toBe(true)
  })

  it('stays closed for a large host where some agents time out and most answer', () => {
    const b = new HostBreaker()
    // A share of failures, including three in a row, among answering agents.
    for (const failed of [false, true, true, true, false, false, true, false, false, false, true, true, true, false, false]) b.record('big.example', failed)
    expect(b.open('big.example')).toBe(false)
  })

  it('opens when a host that answered earlier fails almost everything since', () => {
    const b = new HostBreaker()
    b.record('fading.example', false)
    b.record('fading.example', false)
    for (let i = 0; i < 9; i++) b.record('fading.example', true)
    expect(b.open('fading.example')).toBe(true)
  })

  it('never opens for a host it has not seen', () => {
    expect(new HostBreaker().open('new.example')).toBe(false)
  })
})
