/**
 * Copy text, with a fallback for browsers that refuse the async Clipboard API (insecure
 * origins, embedded webviews, locked-down profiles). Resolves true when the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    // A permission prompt that is never answered leaves writeText pending for good, and the
    // button would look dead: give it a moment, then use the fallback.
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), 700)),
    ])
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
