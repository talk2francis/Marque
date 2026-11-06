import { verifyReadiness } from './lib/readiness.mjs'
console.log(JSON.stringify(await verifyReadiness(process.argv[2] ?? 'http://127.0.0.1:3299', { instances: Number(process.env.WEB_INSTANCES ?? 2) })))
