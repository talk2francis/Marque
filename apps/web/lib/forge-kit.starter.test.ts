import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { KIT_CATEGORIES, kitFiles } from './forge-kit'
import { STARTER_SOURCES } from './forge-starter-sources'

const ROOT = path.resolve(__dirname, '../../..')

describe('Forge zip ships the starters\' tested parser and live-task test (23 Nov 2026)', () => {
  it('the generated sources match examples/starters exactly (run scripts/gen-forge-starter-sources.mjs after editing a starter)', () => {
    for (const c of KIT_CATEGORIES) {
      const task = readFileSync(path.join(ROOT, 'examples/starters', c, 'src/task.ts'), 'utf8')
      for (const line of STARTER_SOURCES[c].parse) expect(task).toContain(line)
      expect(readFileSync(path.join(ROOT, 'examples/starters', c, 'test/live-task.test.ts'), 'utf8')).toBe(STARTER_SOURCES[c].liveTest)
    }
  })
  it('every kit contains the live-task test and runs it in test:mcs', () => {
    for (const category of KIT_CATEGORIES) {
      const files = kitFiles({ category, name: 'Probe Agent', description: 'A probe agent for the kit test.', priceU: 0.1 })
      const live = files.find((f) => f.path.endsWith('test/live-task.test.ts'))
      expect(live?.content).toBe(STARTER_SOURCES[category].liveTest)
      const pkg = JSON.parse(files.find((f) => f.path.endsWith('package.json'))!.content)
      expect(pkg.scripts['test:mcs']).toContain('test/live-task.test.ts')
      const task = files.find((f) => f.path.endsWith('src/task.ts'))!.content
      for (const line of STARTER_SOURCES[category].parse) expect(task).toContain(line)
    }
  })
})
