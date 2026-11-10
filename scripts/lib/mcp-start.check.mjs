import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const script=readFileSync(new URL('../deploy-web.sh',import.meta.url),'utf8')
const start=script.slice(script.indexOf('start_mcp() {'),script.indexOf('\n# Save while both slots'))
function run(failures) {
  const dir=mkdtempSync(join(tmpdir(),'marque-mcp-readiness-'))
  try {
    mkdirSync(join(dir,'release'));writeFileSync(join(dir,'release/RELEASE_SHA'),'a'.repeat(40))
    const fixture=`ROOT="$FIXTURE"; REL="$FIXTURE"; LOG="$FIXTURE/log"; calls=0
pm2() { :; }
ln() { :; }
sleep() { :; }
say() { echo "$*"; }
http_health() { echo '200 0'; }
node() {
  calls=$((calls+1))
  [ "$EXPECTED_RELEASE_SHA" = '${'a'.repeat(40)}' ] && [ "$WEB_INSTANCES" = 1 ] || return 2
  [ "$calls" -gt "$FAILURES" ]
}
${start}
if start_mcp release legacy; then echo "accepted:$calls"; else echo "refused:$calls"; exit 1; fi`
    return spawnSync('bash',['-c',fixture],{env:{...process.env,FIXTURE:dir,FAILURES:String(failures)},encoding:'utf8',timeout:5000})
  } finally { rmSync(dir,{recursive:true,force:true}) }
}
test('MCP cold readiness can fail before the correct release becomes ready',()=>{
  const r=run(3);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/accepted:4/)
})
test('a release that never becomes ready is not accepted',()=>{
  const r=run(100);assert.equal(r.status,1,r.stderr);assert.match(r.stdout,/refused:30/)
})
