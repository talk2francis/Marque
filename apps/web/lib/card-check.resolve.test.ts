import { describe, expect, it } from 'vitest'
import { resolveCardUrl } from './card-check'
import { differentHost } from '../app/builders/test/TestForm'

describe('card URL resolution (21 Nov: a builder pasted the agent address and got a 404)', () => {
  it('looks for the card at the well-known path when only the agent address is given', () => {
    expect(resolveCardUrl('https://agent.example/')).toEqual({ url: 'https://agent.example/.well-known/agent-card.json', resolved: true })
    expect(resolveCardUrl('https://agent.example')).toEqual({ url: 'https://agent.example/.well-known/agent-card.json', resolved: true })
  })
  it('leaves an explicit card path, a sub-path, a query and non-https alone', () => {
    for (const u of ['https://agent.example/.well-known/agent-card.json', 'https://agent.example/a2a', 'https://agent.example/?x=1', 'http://agent.example/', 'not a url']) {
      expect(resolveCardUrl(u)).toEqual({ url: u, resolved: false })
    }
  })
})

describe('bench: tested host vs registered host', () => {
  it('flags only a different host', () => {
    expect(differentHost('https://new.trycloudflare.com/', 'https://old.trycloudflare.com/.well-known/agent-card.json')).toBe(true)
    expect(differentHost('https://a.example/x', 'https://A.example/.well-known/agent-card.json')).toBe(false)
    expect(differentHost('', 'https://a.example/')).toBe(false)
  })
})
