#!/usr/bin/env node
// Pass PostgreSQL connection settings through the environment, never argv.
import { spawn } from 'node:child_process'
const [command, ...args] = process.argv.slice(2)
if (!['psql', 'pg_dump'].includes(command)) throw new Error('Unsupported PostgreSQL command')
let connection
try { connection = new URL(process.env.DATABASE_URL) } catch { throw new Error('DATABASE_URL is missing or invalid') }
if (!['postgres:', 'postgresql:'].includes(connection.protocol)) throw new Error('Expected a PostgreSQL URL')
const env = { ...process.env,
  PGHOST: connection.hostname, PGPORT: connection.port || '5432',
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
  PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
  PGCONNECT_TIMEOUT: '15',
}
for (const [query, key] of [['sslmode','PGSSLMODE'],['sslrootcert','PGSSLROOTCERT'],['sslcert','PGSSLCERT'],['sslkey','PGSSLKEY'],['options','PGOPTIONS']]) {
  const value = connection.searchParams.get(query)
  if (value !== null) env[key] = value
}
delete env.DATABASE_URL
const child = spawn(command, args, { env, stdio: 'inherit' })
child.on('error', () => { console.error('Could not start PostgreSQL client'); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
