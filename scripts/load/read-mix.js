// Load test: the read mix a visitor produces (k6). First written for P2-11 (27 Sep).
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
    // Targets (reported, not stopping) and the stop rule: more than 0.5% 5xx, or page p95 over 2 s, ends the run at once
    // so a load test never becomes an outage (5 Nov brief, B1).
    page_duration: ['p(95)<800', { threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '20s' }],
    api_duration: ['p(95)<1500'],
    http_5xx: [{ threshold: 'rate<0.005', abortOnFail: true, delayAbortEval: '10s' }],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

// The read mix as of 4 Nov: the marketplace and its search, agent pages, and job rooms across many job ids, so first
// reads of an unviewed job (chain and IPFS reads) are part of the load, not only warm cached pages.
const PAGES = ['/', '/judge', '/agents/keel', '/agents/56/341554', '/agents/97/2718', '/quest', '/builders']
const JOBS = [...Array.from({ length: 60 }, (_, i) => `/jobs/97/${1640 + i}`), ...Array.from({ length: 60 }, (_, i) => `/jobs/56/${57040 + i * 2}`)]
const SEARCH = ['venus', 'yield', 'health factor', 'grid', 'pancakeswap', 'risk', 'rebalance', 'liquidation']
const APIS = ['/api/v1/phase2/coverage', `/api/v1/phase2/wallet/${WALLET}`, '/api/v1/marketplace?limit=24&offset=0', '/api/v1/phase2/ratings/341554']
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)]

export default function () {
  const roll = Math.random()
  const isApi = roll < 0.35
  const path = roll < 0.2 ? pick(APIS) : roll < 0.35 ? `/api/v1/marketplace?limit=24&offset=0&q=${encodeURIComponent(pick(SEARCH))}`
    : roll < 0.6 ? pick(JOBS) : pick(PAGES)
  const name = path.startsWith('/jobs/') ? '/jobs/:id' : path.includes('q=') ? '/api/v1/marketplace?q' : path
  const r = http.get(`${BASE}${path}`, { tags: { name, kind: isApi ? 'api' : 'page' }, timeout: '30s' })
  ;(isApi ? apiDur : pageDur).add(r.timings.duration, { name })
  err5xx.add(r.status >= 500 || r.status === 0)
  sleep(0.5 + Math.random())
}
