import { rangeHistory } from '@marque/positions'

// BNB/USDT 0.05% — a busy pool, so an in-range swap should be found fast.
const busy = '0x36696169C63e42cd08ce11f5deeBbCeBae652050' as const

// 1. A range that certainly contains the current tick: expect inRangeNow.
const t0 = Date.now()
const wide = await rangeHistory(busy, -887000, 887000, { maxChunks: 3 })
console.log('WIDE  ', JSON.stringify(wide), `${Date.now() - t0}ms`)

// 2. A range that certainly does NOT: expect capped, "at least N hours".
const t1 = Date.now()
const impossible = await rangeHistory(busy, 800000, 880000, { maxChunks: 8 })
console.log('NARROW', JSON.stringify(impossible), `${Date.now() - t1}ms`)
