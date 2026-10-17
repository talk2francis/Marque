import { readFile } from 'node:fs/promises'
import { readMachineCatalog } from '../packages/commerce/src/catalog-client.js'
import { buildHirePlan } from '../packages/commerce/src/hire-plan.js'

// No environment, private keys, wallet methods or task POSTs are loaded.
// Optional local JSON: { quote, intent, expected }, with independently reviewed terms.
const [base, inputPath] = process.argv.slice(2)
if (!base) throw Error('Usage: node --import tsx examples/machine-marketplace.mts API_ORIGIN [LOCAL_PLAN_INPUT.json]')
const catalog = await readMachineCatalog(base, { limit: 3, offset: 0 })
console.log(JSON.stringify({ kind: 'catalog', catalog }, null, 2))
if (inputPath) {
  const bytes = await readFile(inputPath)
  if (bytes.byteLength > 128 * 1024) throw Error('Plan input exceeds 128 KiB')
  const result = buildHirePlan(JSON.parse(bytes.toString('utf8')))
  console.log(JSON.stringify({ kind: 'local_unsigned_plan', ...result }, null, 2))
  if (!result.ok) process.exitCode = 1
}
