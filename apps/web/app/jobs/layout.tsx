import { WalletProvider } from '../_components/wallet/WalletProvider'

/** This route signs, so the wallet stack loads with it (the root layout never carries it). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}
