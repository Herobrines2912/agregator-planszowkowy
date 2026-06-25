export function calcDiscount(price: number, priceOrig: number): number {
  if (priceOrig === 0) return 0
  return Math.round((priceOrig - price) / priceOrig * 100)
}

export function calcMinPrice(deals: { price: string }[]): number {
  if (deals.length === 0) return Infinity
  return Math.min(...deals.map((d) => Number(d.price)))
}
