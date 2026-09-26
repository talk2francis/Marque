import { redirect } from 'next/navigation'

// The builder checklist page arrives with P2-10 (DESIGN-SYSTEM.md section 8.8).
// Until then "Builders" opens the listing flow it will wrap.
export default function BuildersPage() {
  redirect('/builders/claim')
}
