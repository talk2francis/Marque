import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { catalogQuerySchema, machineCatalogSchema } from '../packages/commerce/src/catalog-contract.js'
import { hirePlanInputSchema } from '../packages/commerce/src/hire-plan.js'

type Schema = Record<string, unknown>
// Build-time converter for this pinned Zod 3 subset only. Reject new node types.
// Cross-field refinements are still enforced by the runtime; JSON Schema is structural.
function wire(s: z.ZodTypeAny): Schema {
  if (s instanceof z.ZodEffects) return wire(s.innerType())
  if (s instanceof z.ZodOptional) return wire(s.unwrap())
  if (s instanceof z.ZodNullable) return { anyOf: [wire(s.unwrap()), { type: 'null' }] }
  if (s instanceof z.ZodLiteral) return { const: s.value }
  if (s instanceof z.ZodEnum) return { type: 'string', enum: s.options }
  if (s instanceof z.ZodBoolean) return { type: 'boolean' }
  if (s instanceof z.ZodUnion) return { anyOf: s.options.map(wire) }
  if (s instanceof z.ZodArray) return { type: 'array', items: wire(s.element), ...(s._def.maxLength ? { maxItems: s._def.maxLength.value } : {}), ...(s._def.minLength ? { minItems: s._def.minLength.value } : {}) }
  if (s instanceof z.ZodObject) {
    const entries = Object.entries(s.shape) as [string, z.ZodTypeAny][]
    return { type: 'object', properties: Object.fromEntries(entries.map(([k, v]) => [k, wire(v)])), required: entries.filter(([, v]) => !v.isOptional()).map(([k]) => k), additionalProperties: s._def.unknownKeys !== 'strict' }
  }
  if (s instanceof z.ZodNumber) {
    const out: Schema = { type: s.isInt ? 'integer' : 'number' }
    for (const c of s._def.checks) {
      if (c.kind === 'min') out[c.inclusive ? 'minimum' : 'exclusiveMinimum'] = c.value
      if (c.kind === 'max') out[c.inclusive ? 'maximum' : 'exclusiveMaximum'] = c.value
    }
    return out
  }
  if (s instanceof z.ZodString) {
    const out: Schema = { type: 'string' }
    for (const c of s._def.checks) {
      if (c.kind === 'min') out.minLength = c.value
      if (c.kind === 'max') out.maxLength = c.value
      if (c.kind === 'regex') out.pattern = c.regex.source
      if (c.kind === 'datetime') out.format = 'date-time'
      if (c.kind === 'uuid') out.format = 'uuid'
    }
    return out
  }
  if (s instanceof z.ZodNull) return { type: 'null' }
  throw Error('Unsupported machine contract Zod type')
}

const dir = fileURLToPath(new URL('../apps/web/public/api/v1/schemas/', import.meta.url))
mkdirSync(dir, { recursive: true })
for (const [name, schema] of Object.entries({ 'catalog-query.v1': catalogQuerySchema, 'catalog.v1': machineCatalogSchema, 'hire-plan-input.v1': hirePlanInputSchema })) {
  const data = JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://marque.trade/api/v1/schemas/${name}.json`, description: 'Structural contract. Runtime cross-field, freshness, commitment and exact-selection checks remain required; schema validation is not signing permission.', ...wire(schema) }, null, 2) + '\n'
  const file = `${dir}${name}.json`
  if (process.argv.includes('--check')) { if (readFileSync(file, 'utf8') !== data) throw Error(`Contract drift: ${name}`) }
  else writeFileSync(file, data)
}
console.log('Machine JSON Schemas match the pinned runtime structural contracts.')
