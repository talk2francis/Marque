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

/** Maps a legacy `marque:<slug>` id onto the canonical ERC-8004 row id, so old results attach to the row. */
export function canonicalAgentIdSql(column: SQL): SQL {
  const branches = [...firstPartyIdMap()]
    .filter(([id, legacy]) => id !== legacy)
    .map(([canonical, legacy]) => sql`when ${legacy} then ${canonical}`)
  return sql`(case ${column} ${sql.join(branches, sql` `)} else ${column} end)`
}
