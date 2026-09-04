/**
 * PM2 process definitions for Marque.
 *
 * One process per worker, plus the web app. Postgres and Redis are native
 * systemd services and are deliberately NOT managed here (AGENTS.md gotcha 10).
 *
 * Secrets come from /root/.marque/secrets.env, which is outside the repo.
 * PM2 has no dotenv of its own, so each app loads it via a tiny preload.
 */
const fs = require('node:fs')

const SECRETS = '/root/.marque/secrets.env'

/** Parse the env file once at config load so PM2 can inject it per app. */
function loadEnv() {
  const out = {}
  if (!fs.existsSync(SECRETS)) return out
  for (const line of fs.readFileSync(SECRETS, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

const env = loadEnv()
const ROOT = '/root/marque'

module.exports = {
  apps: [
    {
      name: 'marque-ingest',
      cwd: `${ROOT}/apps/worker`,
      script: 'node_modules/.bin/tsx',
      args: 'src/ingest.ts',
      interpreter: 'none',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '600M',
      time: true,
      out_file: '/root/.pm2/logs/marque-ingest-out.log',
      error_file: '/root/.pm2/logs/marque-ingest-err.log',
    },
    {
      name: 'marque-probe',
      cwd: `${ROOT}/apps/worker`,
      script: 'node_modules/.bin/tsx',
      args: 'src/probe.ts',
      interpreter: 'none',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '600M',
      time: true,
      out_file: '/root/.pm2/logs/marque-probe-out.log',
      error_file: '/root/.pm2/logs/marque-probe-err.log',
    },
    {
      name: 'marque-classify',
      cwd: `${ROOT}/apps/worker`,
      script: 'node_modules/.bin/tsx',
      args: 'src/classify.ts',
      interpreter: 'none',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '600M',
      time: true,
      out_file: '/root/.pm2/logs/marque-classify-out.log',
      error_file: '/root/.pm2/logs/marque-classify-err.log',
    },
    {
      // Reference agent. Speaks standard A2A on a public path so it is reached
      // through the same SSRF guard as any third-party agent.
      name: 'marque-keel',
      cwd: ROOT,
      script: 'node_modules/.bin/tsx',
      args: 'agents/keel/src/server.ts',
      interpreter: 'none',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      max_memory_restart: '400M',
      time: true,
      out_file: '/root/.pm2/logs/marque-keel-out.log',
      error_file: '/root/.pm2/logs/marque-keel-err.log',
    },
    {
      name: 'marque-web',
      cwd: `${ROOT}/apps/web`,
      script: '.next/standalone/apps/web/server.js',
      interpreter: 'node',
      env: { ...env, NODE_ENV: 'production', PORT: env.WEB_PORT || '3200', HOSTNAME: '127.0.0.1' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      max_memory_restart: '800M',
      time: true,
      out_file: '/root/.pm2/logs/marque-web-out.log',
      error_file: '/root/.pm2/logs/marque-web-err.log',
    },
  ],
}
