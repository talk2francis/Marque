import { verifyReadiness, verifyLegacyRelease } from './lib/readiness.mjs'
const verify = process.argv[3] === '--legacy' ? verifyLegacyRelease : verifyReadiness
console.log(JSON.stringify(await verify(process.argv[2] ?? 'http://127.0.0.1:3299', { instances: Number(process.env.WEB_INSTANCES ?? 2) })))
