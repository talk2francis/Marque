import { expect, it } from 'vitest'
import { activeTools, CHARTER_TOOLS, TOOLS } from './tools'

it('lists the Charters tools only when Charters is public', () => {
  expect(activeTools({ CHARTERS_PUBLIC: '0' }).map((t) => t.name)).toEqual(TOOLS.map((t) => t.name))
  expect(activeTools({}).some((t) => t.name.startsWith('charter'))).toBe(false)
  expect(activeTools({ CHARTERS_PUBLIC: '1' }).map((t) => t.name)).toEqual([...TOOLS, ...CHARTER_TOOLS].map((t) => t.name))
})

it('keeps the Charters tools read only, with names unique across the server', () => {
  const names = activeTools({ CHARTERS_PUBLIC: '1' }).map((t) => t.name)
  expect(new Set(names).size).toBe(names.length)
  expect(CHARTER_TOOLS.map((t) => t.name)).toEqual(['charters_list', 'charter_get', 'charter_quote'])
  for (const t of CHARTER_TOOLS) expect(t.inputSchema['additionalProperties']).toBe(false)
})
