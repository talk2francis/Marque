'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Site-wide providers, kept light: only the react-query client (the header's
 * status read, the quest API, the wallet hooks all share it). The wallet stack
 * loads separately, where it is needed (wallet/WalletProvider.tsx).
 */
const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
