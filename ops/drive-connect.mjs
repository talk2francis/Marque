#!/usr/bin/env node
// Interactive OAuth setup. Tokens stay in rclone's private config, never stdout.
import { spawn } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
const config = '/root/.marque/rclone.conf'
process.umask(0o077)
const child = spawn('rclone', ['config','create','marque-drive','drive','scope','drive.file','config_is_local','true','--config',config], {stdio:['ignore','pipe','pipe']})
let pending=''
function consume(chunk) {
  pending += chunk.toString()
  const lines=pending.split('\n'); pending=lines.pop() ?? ''
  for (const line of lines) {
    const local=line.match(/http:\/\/127\.0\.0\.1:53682\/auth\?state=[a-zA-Z0-9_-]+/)
    if(local) console.log('Open through your SSH tunnel: '+local[0])
    else if (/Waiting for code|Got code/.test(line)) console.log(line.replace(/^.*(Waiting for code|Got code).*$/, '$1'))
  }
}
child.stdout.on('data',consume); child.stderr.on('data',consume)
child.on('exit',code=>{
  if(existsSync(config)) chmodSync(config,0o600)
  console.log(code===0 ? 'Drive authorization saved privately. Verify the remote before enabling backups.' : 'Drive authorization failed. No token was printed.')
  process.exitCode=code ?? 1
})
