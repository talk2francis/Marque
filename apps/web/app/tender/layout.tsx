import { WalletProvider } from '../_components/wallet/WalletProvider'

/** The task form reads the connected wallet (prefill), so the wallet stack loads with this route. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}
