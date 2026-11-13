import { verifyReadiness, verifyLegacyRelease } from './lib/readiness.mjs'
import webRuntime from '../ops/web-runtime.cjs'
import { warmWorkerRoutes } from './lib/warm-worker-routes.mjs'
const verify = process.argv[3] === '--legacy' ? verifyLegacyRelease : verifyReadiness
const base = process.argv[2] ?? 'http://127.0.0.1:3299'
const instances = Number(process.env.WEB_INSTANCES ?? webRuntime.instances)
console.log(JSON.stringify(await verify(base, { instances })))
if (verify !== verifyLegacyRelease && instances > 1) console.log(JSON.stringify(await warmWorkerRoutes(base, { instances, routes: [webRuntime.warmRoute] })))
