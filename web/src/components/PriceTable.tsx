import { formatPrice, formatNull } from '@/lib/format'
import { calcDiscount } from '@/lib/calc'
import type { GameProduct } from '@/db/queries/game-passport'

export interface PriceTableProps {
  products: GameProduct[]
  bestProductId: number | null
}

function badgeColor(discount: number): string {
  if (discount < 40) return '#3D5C3A'
  if (discount <= 70) return '#C07B18'
  return '#C42B2B'
}

export function PriceTable({ products, bestProductId }: PriceTableProps) {
  if (products.length === 0) return null

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <caption style={visuallyHidden}>Porównanie cen w sklepach</caption>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
          <th scope="col" style={headerStyle}>Sklep</th>
          <th scope="col" style={headerStyle}>Cena</th>
          <th scope="col" style={headerStyle}>Cena oryginalna</th>
          <th scope="col" style={headerStyle}>Rabat</th>
          <th scope="col" style={headerStyle}>Dostępność</th>
          <th scope="col" style={headerStyle}>Akcja</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const isCheapest = product.id === bestProductId
          const discount =
            product.price && product.price_orig
              ? calcDiscount(parseFloat(product.price), parseFloat(product.price_orig))
              : null
          const hasDiscount = discount !== null && discount > 0

          return (
            <tr
              key={product.id}
              data-testid="price-table-row"
              style={{
                opacity: product.in_stock ? 1 : 0.55,
                borderLeft: isCheapest ? '3px solid #3D5C3A' : '3px solid transparent',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <td style={cellStyle}>
                {product.store_name}
                {isCheapest && (
                  <span
                    data-testid="najtaniej-chip"
                    style={{
                      display: 'inline-block',
                      marginLeft: '8px',
                      border: '1px solid #3D5C3A',
                      color: '#3D5C3A',
                      fontSize: '10px',
                      fontWeight: 700,
                      borderRadius: '4px',
                      padding: '1px 6px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                    }}
                  >
                    NAJTANIEJ
                  </span>
                )}
              </td>
              <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {formatPrice(product.price)}
              </td>
              <td
                style={{
                  ...cellStyle,
                  color: 'var(--color-text-muted)',
                  textDecoration: product.price_orig ? 'line-through' : undefined,
                }}
              >
                {product.price_orig ? formatPrice(product.price_orig) : formatNull(null)}
              </td>
              <td style={cellStyle} data-testid="rabat-cell">
                {hasDiscount ? (
                  <span
                    data-testid="discount-badge"
                    style={{
                      backgroundColor: badgeColor(discount as number),
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    -{discount}%
                  </span>
                ) : (
                  formatNull(null)
                )}
              </td>
              <td style={{ ...cellStyle, color: product.in_stock ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                {product.in_stock ? 'Dostępny' : 'Niedostępny'}
              </td>
              <td style={cellStyle}>
                {product.in_stock ? (
                  <a
                    href={product.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="buy-link"
                    style={{
                      display: 'inline-block',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#3D5C3A',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Kup →
                  </a>
                ) : (
                  <span data-testid="unavailable-label" style={{ color: 'var(--color-text-muted)' }}>
                    Niedostępny
                  </span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const headerStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const cellStyle: React.CSSProperties = {
  padding: '10px',
  verticalAlign: 'middle',
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}
