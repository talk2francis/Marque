import http from 'node:http'

/** A private keep-alive connection binds readiness and route initialization to one worker. */
export async function warmWorkerRoutes(base, { instances, routes }) {
  const origin = new URL(base)
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') throw Error('Worker initialization requires the loopback slot')
  if (!Number.isInteger(instances) || instances < 1 || instances > 16) throw Error('Invalid worker count')
  const workers = new Set()
  for (let attempt = 0; attempt < instances * 8 && workers.size < instances; attempt++) {
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
    const read = path => new Promise((resolve, reject) => {
      const request = http.get(new URL(path, origin), { agent }, response => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', chunk => { body += chunk })
        response.on('error', reject)
        response.on('end', () => response.complete && response.statusCode === 200
          ? resolve(body) : reject(Error(`Incomplete worker initialization: ${path}`)))
      })
      const timer = setTimeout(() => request.destroy(Error('Worker initialization timed out')), 45000)
      request.on('close', () => clearTimeout(timer))
      request.on('error', reject)
    })
    try {
      const ready = JSON.parse(await read('/api/ready'))
      if (ready.ready !== true || !/^[a-f0-9-]{36}$/.test(ready.instance)) throw Error('Worker is not ready')
      if (!workers.has(ready.instance)) {
        for (const route of routes) {
          if (!(await read(route)).includes('</html>')) throw Error(`Incomplete worker page: ${route}`)
        }
        // Verify that the keep-alive connection was not replaced while warming.
        const after = JSON.parse(await read('/api/ready'))
        if (after.instance !== ready.instance) throw Error('Worker changed during initialization')
        workers.add(ready.instance)
      }
    } finally { agent.destroy() }
  }
  if (workers.size !== instances) throw Error(`Initialized routes on ${workers.size} of ${instances} workers`)
  return { workers: workers.size, routes }
}
