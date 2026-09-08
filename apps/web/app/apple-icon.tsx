import { ImageResponse } from 'next/og'

/** The home-screen icon. Full mark on the brand ground, generous padding. */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#15160F',
        }}
      >
        <svg width="128" height="128" viewBox="0 0 100 100" fill="#EDEDE7">
          <path d="M50 43C46 36 39 30 32 30 27 30 25 33 25 39.5L25 58C25 63 24.5 68 28.5 67.5L50 43Z" />
          <path d="M50 43C54 36 61 30 68 30 73 30 75 33 75 39.5L75 58C75 63 75.5 68 71.5 67.5L50 43Z" />
        </svg>
      </div>
    ),
    size,
  )
}
