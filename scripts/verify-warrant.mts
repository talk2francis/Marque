import fs from 'node:fs'
import { verifyWarrantBundle } from '@marque/conformance'

const file = process.argv[2]
if (!file || fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('Provide one local JSON bundle, at most 2 MiB. No URL fetching or signing is performed.')
const report = verifyWarrantBundle(JSON.parse(fs.readFileSync(file, 'utf8')), {
  ...(process.argv[3] ? { expectedServiceKey: process.argv[3] } : {}),
  ...(process.argv[4] ? { expectedRequestHash: process.argv[4] } : {}),
})
console.log(JSON.stringify(report, null, 2))
// Exit0 means a consistent inspection, including an honestly failed test.
// It never means guaranteed quality, identity, current chain truth or payment.
process.exitCode = 'integrity' in report && report.integrity === 'MATCH' && 'replay' in report && report.replay.agreesWithRecord ? 0 : 1
