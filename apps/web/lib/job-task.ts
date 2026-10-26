/** The buyer's words in an ERC-8183 job description: a Marque (or Studio) description is JSON with a `task`; any other is plain text. */
export function taskFromDescription(description: string): string {
  try {
    const j = JSON.parse(description) as { task?: unknown }
    if (typeof j.task === 'string' && j.task.trim()) return j.task
  } catch { /* plain text */ }
  return description
}
