export function calcDiscount(price: number, priceOrig: number): number {
  if (priceOrig === 0) return 0
  return Math.round((priceOrig - price) / priceOrig * 100)
}

export function calcMinPrice(deals: { price: string }[]): number {
  if (deals.length === 0) return Infinity
  return Math.min(...deals.map((d) => Number(d.price)))
}

export function calcMarginProxy(currentPrice: string, historicalMax: string): number | null {
  const current = parseFloat(currentPrice)
  const historical = parseFloat(historicalMax)
  if (!Number.isFinite(current) || current <= 0) return null
  if (!Number.isFinite(historical) || historical <= 0) return null
  return Math.round(((historical - current) / current) * 100 * 10) / 10
}
