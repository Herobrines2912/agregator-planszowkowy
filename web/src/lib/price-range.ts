// Shared time-range type + constants. This MUST stay a plain (non-'use client')
// module: it's imported by server code (the price-history query and API route) as
// well as by client components. When these were exported from the 'use client'
// TimeRangeSelector, the server received client-reference stubs instead of the real
// values, so RANGE_DAYS[range] was undefined during prerender and produced invalid
// SQL (`NOW() - ( * INTERVAL '1 day')`).
export type Range = '1T' | '2T' | '1M' | '3M' | '6M'

export const RANGE_DAYS: Record<Range, number> = {
  '1T': 7,
  '2T': 14,
  '1M': 30,
  '3M': 90,
  '6M': 180,
}

export const ALL_RANGES: Range[] = ['1T', '2T', '1M', '3M', '6M']
