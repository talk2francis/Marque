import { expect, it } from 'vitest'
import { withDeadline } from './deadline'
it('returns a completed check and bounds an unavailable dependency', async () => {
  expect(await withDeadline(Promise.resolve(7), 50)).toBe(7)
  await expect(withDeadline(new Promise(() => {}), 5)).rejects.toThrow('Check timed out')
})
