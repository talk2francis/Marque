import { NextResponse } from 'next/server'
import { profileInput } from '../../../../../lib/profile-model'
import { deleteWalletProfile, ProfileUnavailable, readSession, saveWalletProfile } from '../../../../../lib/wallet-profile'

export const dynamic = 'force-dynamic'

const unauthorised = () => NextResponse.json({ error: 'sign_in', detail: 'Sign in with this wallet to edit its profile.' }, { status: 401 })
const unavailable = (err: unknown) => NextResponse.json({ error: 'unavailable', detail: err instanceof ProfileUnavailable ? err.message : 'The profile could not be saved just now.' }, { status: 503 })

/** PUT: save the signed-in wallet's profile. */
export async function PUT(request: Request) {
  const session = readSession(request.headers.get('authorization'))
  if (!session) return unauthorised()
  const input = profileInput.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'bad_request', detail: input.error.issues[0]?.message ?? 'Check the profile fields.' }, { status: 400 })
  try {
    const r = await saveWalletProfile(session, input.data)
    if (!r.ok) return NextResponse.json({ error: 'refused', detail: r.detail }, { status: r.status })
    return NextResponse.json({ profile: r.profile })
  } catch (err) { return unavailable(err) }
}

/** DELETE: remove the profile and the images it uploaded (except those still used as an agent's portrait). */
export async function DELETE(request: Request) {
  const session = readSession(request.headers.get('authorization'))
  if (!session) return unauthorised()
  try {
    await deleteWalletProfile(session)
    return NextResponse.json({ deleted: true })
  } catch (err) { return unavailable(err) }
}
