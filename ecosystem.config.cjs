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
  { name: 'tidemark', port: 8615 },
]

const agentApps = REFERENCE_AGENTS.map(({ name, port }) => ({
  name: `marque-${name}`,
  cwd: `${ROOT}/agents/${name}`,
  // Sellers stay on the tsx wrapper: under PM2, `node --import tsx` exits at startup for the
  // seller runtime (it runs fine by hand; 27 Sep). PM2's ceiling below therefore sees the
  // wrapper, so ops/marque-alerts.mjs watches each seller's real process-tree memory.
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
    // Where the seller runtime publishes each ERC-8183 deliverable; the URL goes on chain
    // with submit(), so it must be public (Caddy routes /agents/<name>/* to this agent).
    ERC8183_AGENT_URL: `${env.MARQUE_PUBLIC_URL || 'https://marque.trade'}/agents/${name}/erc8183`,
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
      script: 'src/ingest.ts',
      // One process, so PM2's memory limit watches the worker itself (a tsx wrapper
      // spawns a child and PM2 saw only the 19 MB wrapper; P2-11 memory budget).
      interpreter: 'node',
      node_args: '--import tsx',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '500M',
      time: true,
      out_file: '/root/.pm2/logs/marque-ingest-out.log',
      error_file: '/root/.pm2/logs/marque-ingest-err.log',
    },
    {
      name: 'marque-probe',
      cwd: `${ROOT}/apps/worker`,
      script: 'src/probe.ts',
      // One process, so PM2's memory limit watches the worker itself (a tsx wrapper
      // spawns a child and PM2 saw only the 19 MB wrapper; P2-11 memory budget).
      interpreter: 'node',
      node_args: '--import tsx',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '400M',
      time: true,
      out_file: '/root/.pm2/logs/marque-probe-out.log',
      error_file: '/root/.pm2/logs/marque-probe-err.log',
    },
    {
      name: 'marque-classify',
      cwd: `${ROOT}/apps/worker`,
      script: 'src/classify.ts',
      // One process, so PM2's memory limit watches the worker itself (a tsx wrapper
      // spawns a child and PM2 saw only the 19 MB wrapper; P2-11 memory budget).
      interpreter: 'node',
      node_args: '--import tsx',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '300M',
      time: true,
      out_file: '/root/.pm2/logs/marque-classify-out.log',
      error_file: '/root/.pm2/logs/marque-classify-err.log',
    },
    {
      name: 'marque-pancake-watch',
      cwd: `${ROOT}/apps/worker`,
      script: 'src/pancake-watch.ts',
      // One process, so PM2's memory limit watches the worker itself (a tsx wrapper
      // spawns a child and PM2 saw only the 19 MB wrapper; P2-11 memory budget).
      interpreter: 'node',
      node_args: '--import tsx',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '350M',
      time: true,
      out_file: '/root/.pm2/logs/marque-pancake-watch-out.log',
      error_file: '/root/.pm2/logs/marque-pancake-watch-err.log',
    },
    {
      // P2-01: signed ERC-8183 quotes from every seller, on a schedule. Read only.
      name: 'marque-indexer',
      cwd: `${ROOT}/apps/worker`,
      script: 'src/indexer.ts',
      // One process, so PM2's memory limit watches the worker itself (a tsx wrapper
      // spawns a child and PM2 saw only the 19 MB wrapper; P2-11 memory budget).
      interpreter: 'node',
      node_args: '--import tsx',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '400M',
      time: true,
      out_file: '/root/.pm2/logs/marque-indexer-out.log',
      error_file: '/root/.pm2/logs/marque-indexer-err.log',
    },
    {
      name: 'marque-keeper',
      cwd: `${ROOT}/apps/worker`,
      script: 'src/keeper.ts',
      // One process, so PM2's memory limit watches the worker itself (a tsx wrapper
      // spawns a child and PM2 saw only the 19 MB wrapper; P2-11 memory budget).
      interpreter: 'node',
      node_args: '--import tsx',
      // Mainnet only (G-M1, G-M2). Settles are MegaFuel-sponsored; own gas only above the floor.
      env: { ...env, NODE_ENV: 'production', KEEPER_CHAINS: '56', KEEPER_MAX_PER_HOUR: '50', KEEPER_MIN_BNB: '0.0003' },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 30000,
      max_memory_restart: '350M',
      time: true,
      out_file: '/root/.pm2/logs/marque-keeper-out.log',
      error_file: '/root/.pm2/logs/marque-keeper-err.log',
    },
    {
      name: 'marque-quotes',
      cwd: `${ROOT}/apps/worker`,
      script: 'src/quotes.ts',
      // One process, so PM2's memory limit watches the worker itself (a tsx wrapper
      // spawns a child and PM2 saw only the 19 MB wrapper; P2-11 memory budget).
      interpreter: 'node',
      node_args: '--import tsx',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '400M',
      time: true,
      out_file: '/root/.pm2/logs/marque-quotes-out.log',
      error_file: '/root/.pm2/logs/marque-quotes-err.log',
    },
    {
      // Re-runs every MCS test on a 24h cycle so a Warrant has a date and can
      // go stale (P10.5C item 4). Depends on the reference agents being up.
      name: 'marque-conform',
      cwd: `${ROOT}/apps/worker`,
      script: 'src/conform.ts',
      // One process, so PM2's memory limit watches the worker itself (a tsx wrapper
      // spawns a child and PM2 saw only the 19 MB wrapper; P2-11 memory budget).
      interpreter: 'node',
      node_args: '--import tsx',
      env: { ...env, NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 30000,
      max_memory_restart: '400M',
      time: true,
      out_file: '/root/.pm2/logs/marque-conform-out.log',
      error_file: '/root/.pm2/logs/marque-conform-err.log',
    },
    ...agentApps,
    // Blue/green web (P2-11): two slots behind Caddy. scripts/deploy-web.sh points
    // releases/slot-<port> at a build, starts the idle slot, health-checks it, switches the
    // Caddy upstream (/etc/caddy/marque-upstream.caddy) and stops the old slot 5 min later.
    ...[['marque-web', '3200'], ['marque-web-b', '3201']].map(([name, port]) => ({
      name,
      cwd: `${ROOT}/releases/slot-${port}/apps/web`,
      script: `${ROOT}/releases/slot-${port}/apps/web/server.js`,
      interpreter: 'node',
      // Two processes per slot (Node cluster, one shared port): one Next process is one
      // core, and the P2-11 load test saturated it at about 15 requests a second.
      instances: 2,
      exec_mode: 'cluster',
      // Set and Earn runs on BSC mainnet (P2-05 step 8); testnet 97 stays as staging.
      env: { ...env, NODE_ENV: 'production', PORT: port, HOSTNAME: '127.0.0.1', MARQUE_ROOT: ROOT, MARQUE_CAMPAIGN_CHAIN: '56', NEXT_PUBLIC_MARQUE_CAMPAIGN_CHAIN: '56' },
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      max_memory_restart: '800M',
      time: true,
      out_file: `/root/.pm2/logs/${name}-out.log`,
      error_file: `/root/.pm2/logs/${name}-err.log`,
    })),
    {
      // P2-11 item 5, LAUNCH-RUNBOOK 3: indexer lag, seller quotes, hireable per category,
      // 5xx rate, keeper BNB, disk, restart loops, stuck jobs. Telegram when configured.
      name: 'marque-alerts',
      cwd: ROOT,
      script: `${ROOT}/ops/marque-alerts.mjs`,
      interpreter: 'node',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory_restart: '150M',
      time: true,
      out_file: '/root/.pm2/logs/marque-alerts-out.log',
      error_file: '/root/.pm2/logs/marque-alerts-err.log',
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
