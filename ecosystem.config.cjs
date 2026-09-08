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

/**
 * Per-agent secrets.
 *
 * Each reference agent owns an encrypted keystore and the password that
 * unlocks it, and both live beside the agent in `.studio/` — outside the repo,
 * gitignored, 0600. Merged on top of the shared secrets so an agent process
 * gets exactly its own key and no other agent's.
 */
function loadAgentEnv(name) {
  const file = `/root/marque/agents/${name}/.studio/.env.local`
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    if (value !== '') out[key] = value
  }
  return out
}

const env = loadEnv()
const ROOT = '/root/marque'

/**
 * The five reference agents (P8a).
 *
 * Self-hosted from the BNB Agent Studio scaffold, on their own ports behind
 * Caddy. Deliberately NOT `bag deploy --provider bnb`: that is a 48-hour
 * testnet trial in the operator's cloud and signing material leaves our
 * control (AGENTS.md gotcha 2). The emitted TypeScript is ours, so it runs
 * here under the same supervision as everything else.
 */
const REFERENCE_AGENTS = [
  { name: 'bound', port: 8611 },
  { name: 'lattice', port: 8612 },
  { name: 'sluicegate', port: 8613 },
  { name: 'redcell', port: 8614 },
  { name: 'keel', port: 8610 },
]

const agentApps = REFERENCE_AGENTS.map(({ name, port }) => ({
  name: `marque-${name}`,
  cwd: `${ROOT}/agents/${name}`,
  script: `${ROOT}/node_modules/.bin/tsx`,
  args: 'src/unifiedMain.ts',
  interpreter: 'none',
  env: {
    ...env,
    ...loadAgentEnv(name),
    NODE_ENV: 'production',
    AGENT_PORT: String(port),
    AGENT_BIND_HOST: '127.0.0.1',
    MARQUE_AGENT_PUBLIC_URL: `${env.MARQUE_PUBLIC_URL || 'https://marque.trade'}/agents/${name}`,
  },
  autorestart: true,
  max_restarts: 50,
  restart_delay: 3000,
  // Five agents share this box with the web app and three workers, and an OOM
  // here once took the PM2 daemon down with it. A ceiling per agent is cheaper
  // than finding out again.
  max_memory_restart: '300M',
  time: true,
  out_file: `/root/.pm2/logs/marque-${name}-out.log`,
  error_file: `/root/.pm2/logs/marque-${name}-err.log`,
}))

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
      name: 'marque-pancake-watch',
      cwd: `${ROOT}/apps/worker`,
      script: 'node_modules/.bin/tsx',
      args: 'src/pancake-watch.ts',
      interpreter: 'none',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '600M',
      time: true,
      out_file: '/root/.pm2/logs/marque-pancake-watch-out.log',
      error_file: '/root/.pm2/logs/marque-pancake-watch-err.log',
    },
    {
      // Re-runs every MCS test on a 24h cycle so a Warrant has a date and can
      // go stale (P10.5C item 4). Depends on the reference agents being up.
      name: 'marque-conform',
      cwd: `${ROOT}/apps/worker`,
      script: 'node_modules/.bin/tsx',
      args: 'src/conform.ts',
      interpreter: 'none',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 30000,
      max_memory_restart: '600M',
      time: true,
      out_file: '/root/.pm2/logs/marque-conform-out.log',
      error_file: '/root/.pm2/logs/marque-conform-err.log',
    },
    ...agentApps,
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
    {
      // P11 item 4 — health monitor: /status + each agent /health every 60s,
      // Telegram alert on two consecutive failures.
      name: 'marque-health',
      cwd: ROOT,
      script: `${ROOT}/ops/health-monitor.sh`,
      interpreter: 'bash',
      autorestart: true,
      max_restarts: 100,
      restart_delay: 10000,
      time: true,
      out_file: '/root/.pm2/logs/marque-health-out.log',
      error_file: '/root/.pm2/logs/marque-health-err.log',
    },
  ],
}
