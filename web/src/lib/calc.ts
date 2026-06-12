export function calcDiscount(price: number, priceOrig: number): number {
  if (priceOrig === 0) return 0
  return Math.round((priceOrig - price) / priceOrig * 100)
}
