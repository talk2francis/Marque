// Injected EIP-1193 provider. One declaration for the whole app.
interface EthereumProvider {
  request(a: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}
interface Window {
  ethereum?: EthereumProvider
}
