const PREFIX = 'marque:charter-control:'

export function storeCharterControl(charterId: string, token: string): void {
  window.localStorage.setItem(`${PREFIX}${charterId}`, token)
}

export function readCharterControl(charterId: string): string | null {
  return window.localStorage.getItem(`${PREFIX}${charterId}`)
}

export function forgetCharterControl(charterId: string): void {
  window.localStorage.removeItem(`${PREFIX}${charterId}`)
}
