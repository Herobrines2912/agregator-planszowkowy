import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Agregator Cen Planszówek'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F2EAD8',
          gap: '24px',
        }}
      >
        <div
          style={{
            fontFamily: 'serif',
            fontSize: '60px',
            fontWeight: 700,
            color: '#3D5C3A',
            letterSpacing: '-1px',
          }}
        >
          Agregator Planszówek
        </div>

        <div
          style={{
            width: '200px',
            height: '1px',
            backgroundColor: '#D4C4AE',
          }}
        />

        <div
          style={{
            fontFamily: 'sans-serif',
            fontSize: '28px',
            color: '#6B5744',
          }}
        >
          Porównaj ceny planszówek w polskich sklepach
        </div>
      </div>
    ),
    { ...size }
  )
}
