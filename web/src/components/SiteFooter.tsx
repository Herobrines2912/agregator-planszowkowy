import Link from 'next/link'

const footerLinks = [
  { href: '/o-projekcie', label: 'O projekcie' },
  { href: '/api', label: 'API' },
  { href: '/kontakt', label: 'Kontakt' },
]

export function SiteFooter() {
  return (
    <footer
      style={{
        marginTop: '48px',
        padding: '24px 40px',
        borderTop: '1px solid #D4C4AE',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
      }}
    >
      {/* Logo mark + freshness */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span
          style={{
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: '16px',
            fontWeight: 700,
            color: '#3D5C3A',
          }}
        >
          Agregator Cen
        </span>
        <span style={{ fontSize: '12px', color: '#A89480' }}>
          Dane aktualizowane co 6h
        </span>
      </div>

      {/* Tertiary nav links */}
      <nav aria-label="Linki pomocnicze">
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            gap: '24px',
          }}
        >
          {footerLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                style={{ fontSize: '13px', color: '#6B5744', textDecoration: 'none' }}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Copyright */}
      <span style={{ fontSize: '12px', color: '#A89480' }}>
        © {new Date().getFullYear()} Agregator Cen Planszówek
      </span>
    </footer>
  )
}
