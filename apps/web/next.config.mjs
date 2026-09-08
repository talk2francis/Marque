/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted behind Caddy: run node .next/standalone/server.js
  // (AGENTS.md gotcha 4). Requires copying static/ and public/ after build.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not a build step.
  transpilePackages: ['@marque/db', '@marque/ui', '@marque/chain', '@marque/registry', '@marque/probe', '@marque/positions', '@marque/mandates', '@marque/execution', '@marque/conformance', '@marque/ledger', '@marque/agent-engines'],
  webpack(config) {
    // Those packages use TypeScript's ESM convention of importing './x.js' from
    // './x.ts'. Node and tsx resolve that natively; webpack needs telling.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    // wagmi's `baseAccount` connector (reached only through RainbowKit's barrel
    // import — we never use it) pulls @coinbase/cdp-sdk, which optionally needs
    // the uninstalled @x402/* payment SDKs. Marque only connects injected
    // wallets, so those code paths never run: stub them to keep the build green.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@x402/evm': false,
      '@x402/evm/exact/client': false,
      '@x402/evm/upto/client': false,
      '@x402/svm': false,
      '@x402/svm/exact/client': false,
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
