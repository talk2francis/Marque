/** Run against the isolated Caddy preview, or production after deployment. */
import assert from 'node:assert/strict'
const base=process.env.BASE_URL ?? 'http://127.0.0.1:3399'
const valid=encodeURIComponent(JSON.stringify(['',{}]))
const cases=[
  ['ordinary page',{},200],
  ['RSC without state',{RSC:'1'},200],
  ['valid RSC',{RSC:'1','Next-Router-State-Tree':valid},200],
  ['malformed RSC',{RSC:'1','Next-Router-State-Tree':'broken'},400],
  ['invalid state shape',{RSC:'1','Next-Router-State-Tree':'{}'},400],
  ['empty state',{RSC:'1','Next-Router-State-Tree':''},400],
  ['invalid escape',{RSC:'1','Next-Router-State-Tree':'%'},400],
  ['spoofed mirror cannot bypass',{RSC:'1','Next-Router-State-Tree':'broken','X-Marque-Router-State':`present:${valid}`},400],
  ['client mirror discarded',{'X-Marque-Router-State':'present:broken'},200],
  ['unsupported action',{'Next-Action':'x'},400],
]
for(const [name,headers,expected] of cases) {
  const response=await fetch(`${base}/standard`,{headers,signal:AbortSignal.timeout(30000)})
  await response.arrayBuffer()
  console.log(`${name}: ${response.status}`)
  assert.equal(response.status,expected,name)
}
const nul=await fetch(`${base}/api/v1/charters/a%00b`,{signal:AbortSignal.timeout(15000)})
assert.equal(nul.status,400,'control-byte path')
console.log('control-byte path: 400')
