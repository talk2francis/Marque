import { sql } from 'drizzle-orm'

/** One immutable bound parameter; PostgreSQL parses the array, never SQL text. */
export function textArraySql(values: readonly string[]) {
  // Quote every element so empty strings, commas and the word NULL stay values.
  // PostgreSQL array syntax escapes both backslashes and double quotes.
  const encoded = `{${values.map(value => `"${value.replace(/[\\"]/g, '\\$&')}"`).join(',')}}`
  return sql`${encoded}::text[]`
}
