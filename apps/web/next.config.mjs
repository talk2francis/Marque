/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted behind Caddy: run node .next/standalone/server.js
  // (AGENTS.md gotcha 4). Requires copying static/ and public/ after build.
  output: 'standalone',
  distDir: process.env.MARQUE_BUILD_DIR || '.next',
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
    // Pragmatic CSP (P11 item 6). The browser never talks to an RPC directly for
    // reads — those are server-side — so connect-src only needs self, the client
    // RPC wagmi is configured with, and WalletConnect's relay/verify for the one
    // signature flow. 'unsafe-inline' on script/style is Next's cost without a
    // nonce middleware; everything else is locked down.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // 8004scan hosts the registry-supplied agent avatars we already index.
      // They are images only, clearly labelled CLAIMED in the UI, and never on
      // a trust-bearing path. Everything else stays self/data/blob.
      "img-src 'self' data: blob: https://api.8004scan.io",
      "font-src 'self' data:",
      "connect-src 'self' https://bsc-dataseed.bnbchain.org https://bsc-testnet-rpc.publicnode.com https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://explorer-api.walletconnect.com https://pulse.walletconnect.org",
      "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // The read API is meant to be consumed from anywhere.
        source: '/api/v1/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ]
  },
}

export default nextConfig
