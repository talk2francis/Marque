import { WalletProvider } from '../_components/wallet/WalletProvider'

/** Charters sign (grant, end, protect now), so the wallet stack loads with the route. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}
