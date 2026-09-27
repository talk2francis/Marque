import {describe,it,expect} from 'vitest'
import {isIdentityMint} from './registration-evidence'
describe('registration evidence', () => {
  const registry='0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'
  const log={address:registry,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(64),'0x'+'1'.repeat(64),'0x'+'7'.padStart(64,'0')]}
  it('accepts only a mint of the exact registry identity', () => {
    expect(isIdentityMint(log,registry,'7')).toBe(true)
    expect(isIdentityMint(log,registry,'8')).toBe(false)
    expect(isIdentityMint({...log,address:'0x'+'1'.repeat(40)},registry,'7')).toBe(false)
    expect(isIdentityMint({...log,topics:[log.topics[0]!,log.topics[2]!,log.topics[2]!,log.topics[3]!]},registry,'7')).toBe(false)
  })
})
