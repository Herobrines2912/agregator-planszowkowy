export function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'

  const isWhole = num % 1 === 0
  const [int, dec] = num.toFixed(2).split('.')
  return isWhole ? `${int} zł` : `${int},${dec} zł`
}

export function formatNull(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

export function formatTimestamp(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateMedium(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })
  // → "12 cze 2026"
}
