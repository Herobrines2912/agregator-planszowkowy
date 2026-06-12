'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SiteHeader() {
  const pathname = usePathname()
  const isFlipperActive = pathname === '/flipper'

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: '64px',
        backgroundColor: '#EDE5D4',
        borderBottom: '1px solid #D4C4AE',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          padding: '0 40px',
          gap: '32px',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            flexShrink: 0,
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: '20px',
            fontWeight: 800,
            color: '#3D5C3A',
            textDecoration: 'none',
            letterSpacing: '-0.3px',
          }}
        >
          Agregator Cen
        </Link>

        {/* Search — non-functional MVP placeholder */}
        <div style={{ flex: 1, maxWidth: '440px', margin: '0 auto' }}>
          <input
            type="search"
            placeholder="Szukaj gry planszowej…"
            aria-label="Szukaj gry"
            readOnly
            style={{
              width: '100%',
              height: '40px',
              borderRadius: '24px',
              border: '1px solid #D4C4AE',
              backgroundColor: '#F5F0EA',
              padding: '0 18px',
              fontSize: '14px',
              color: '#2C1F14',
              outline: 'none',
              fontFamily: 'inherit',
              cursor: 'default',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/flipper"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: '36px',
              padding: '0 16px',
              borderRadius: '24px',
              border: '2px solid #3D5C3A',
              backgroundColor: isFlipperActive ? '#3D5C3A' : 'transparent',
              color: isFlipperActive ? '#fff' : '#3D5C3A',
              fontSize: '13px',
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Flipper Mode
          </Link>

          {/* Hamburger — non-functional MVP placeholder (UX-07 / Phase 2) */}
          <button
            type="button"
            aria-label="Menu"
            style={{
              width: '38px',
              height: '38px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '5px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <span style={{ width: '20px', height: '2px', backgroundColor: '#2C1F14', borderRadius: '2px', display: 'block' }} />
            <span style={{ width: '20px', height: '2px', backgroundColor: '#2C1F14', borderRadius: '2px', display: 'block' }} />
            <span style={{ width: '20px', height: '2px', backgroundColor: '#2C1F14', borderRadius: '2px', display: 'block' }} />
          </button>
        </div>
      </div>
    </header>
  )
}
