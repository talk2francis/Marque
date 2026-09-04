/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted behind Caddy: run node .next/standalone/server.js
  // (AGENTS.md gotcha 4). Requires copying static/ and public/ after build.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not a build step.
  transpilePackages: ['@marque/db', '@marque/ui', '@marque/chain', '@marque/registry', '@marque/probe', '@marque/positions'],
  webpack(config) {
    // Those packages use TypeScript's ESM convention of importing './x.js' from
    // './x.ts'. Node and tsx resolve that natively; webpack needs telling.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
