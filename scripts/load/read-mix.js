// P2-11 load test: the read mix a launch-day visitor produces (k6).
//   k6 run -e BASE=https://marque.trade -e VUS=100 -e HOLD=90s scripts/load/read-mix.js
// Pages are the server-rendered routes; APIs are the quest's public reads.
import http from 'k6/http'
import { sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const BASE = __ENV.BASE || 'https://marque.trade'
const VUS = Number(__ENV.VUS || 25)
const HOLD = __ENV.HOLD || '90s'
const WALLET = __ENV.WALLET || '0x4bfD3f9c81a743F852Fb424FD487A1c53d7786D5'

const pageDur = new Trend('page_duration', true)
const apiDur = new Trend('api_duration', true)
const err5xx = new Rate('http_5xx')

export const options = {
  scenarios: {
    reads: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '20s', target: VUS }, { duration: HOLD, target: VUS }, { duration: '5s', target: 0 }] },
  },
  thresholds: {
    page_duration: ['p(95)<800'],
    api_duration: ['p(95)<1500'],
    http_5xx: ['rate<0.005'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

const PAGES = ['/', '/register', '/register/yield', '/agents/keel', '/quest']
const APIS = ['/api/v1/phase2/coverage', `/api/v1/phase2/wallet/${WALLET}`]

export default function () {
  const isApi = Math.random() < 0.35
  const path = isApi ? APIS[Math.floor(Math.random() * APIS.length)] : PAGES[Math.floor(Math.random() * PAGES.length)]
  const r = http.get(`${BASE}${path}`, { tags: { name: path, kind: isApi ? 'api' : 'page' }, timeout: '30s' })
  ;(isApi ? apiDur : pageDur).add(r.timings.duration, { name: path })
  err5xx.add(r.status >= 500 || r.status === 0)
  sleep(0.5 + Math.random())
}
