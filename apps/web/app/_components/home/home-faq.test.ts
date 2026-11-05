import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { HOME_FAQ, faqFor, faqJsonLd, type FaqContext } from './home-faq'
import { articles } from '../../docs/articles'

const before: FaqContext = { feeBp: 0, closed: false, afterCloseDays: 0, tools: 11 }
const after: FaqContext = { feeBp: 0, closed: true, afterCloseDays: 2, tools: 11 }
const text = (c: FaqContext) => faqFor(c).flatMap((f) => [f.q, ...f.a(c), f.proof.label]).join('\n')
const APP = join(__dirname, '..', '..')

describe("the home page's questions", () => {
  it('are eight evergreen ones, plus one about Set and Earn only after the close and for a while', () => {
    expect(faqFor(before)).toHaveLength(8)
    expect(faqFor(after)).toHaveLength(9)
    expect(faqFor({ ...after, afterCloseDays: 60 })).toHaveLength(8)
    expect(new Set(HOME_FAQ.map((f) => f.id)).size).toBe(HOME_FAQ.length)
  })
  it('never use em or en dashes, and never promise what the product cannot', () => {
    const t = text(after)
    expect(t).not.toMatch(/[\u2013\u2014]/)
    expect(t).not.toMatch(/guarantee|instant refund|Marque holds your|verified agent/i)
  })
  it('state the escrow fee only as read from the contract', () => {
    const money = HOME_FAQ.find((f) => f.id === 'where-does-my-money-go')!
    expect(money.a({ ...before, feeBp: 0 }).join(' ')).toContain('0% today, read from the contract')
    expect(money.a({ ...before, feeBp: 250 }).join(' ')).toContain('2.5% today')
    expect(money.a({ ...before, feeBp: null }).join(' ')).not.toMatch(/\d%/)
  })
  it('count the assistant tools from the server, in words', () => {
    const ai = HOME_FAQ.find((f) => f.id === 'can-my-ai-assistant-use-marque')!
    expect(ai.a(before)[0]).toContain('eleven tools')
    expect(ai.a({ ...before, tools: 12 })[0]).toContain('twelve tools')
  })
  it('each end at a page that exists', () => {
    for (const f of HOME_FAQ) {
      const path = f.proof.href.split('#')[0]!.replace(/^\//, '')
      const page = existsSync(join(APP, ...path.split('/'), 'page.tsx'))
      const article = path.startsWith('docs/') && path.split('/').length === 2 && path.split('/')[1]! in articles
      expect(page || article, f.proof.href).toBe(true)
    }
  })
  it('go out as FAQPage structured data in exactly the words on the page', () => {
    const ld = faqJsonLd(after)
    expect(ld['@type']).toBe('FAQPage')
    expect(ld.mainEntity).toHaveLength(9)
    faqFor(after).forEach((f, i) => {
      expect(ld.mainEntity[i]!.name).toBe(f.q)
      expect(ld.mainEntity[i]!.acceptedAnswer.text).toBe(f.a(after).join(' '))
    })
  })
})
