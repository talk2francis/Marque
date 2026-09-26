import { sql, type SQL } from 'drizzle-orm'
import { firstPartyIds, firstPartyIdMap } from './first-party.js'

/** `(<id>, <id>, ...)` of every first-party agent id, for `not in` / `in` filters. */
export function firstPartyIdListSql(): SQL {
  return sql`(${sql.join(firstPartyIds().map((id) => sql`${id}`), sql`, `)})`
}

/** Folds a first-party canonical id onto its legacy id, so one agent counts once. */
export function oneAgentIdSql(column: SQL): SQL {
  const branches = [...firstPartyIdMap()].map(([id, legacy]) => sql`when ${id} then ${legacy}`)
  return sql`(case ${column} ${sql.join(branches, sql` `)} else ${column} end)`
}
