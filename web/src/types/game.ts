export interface GameMetaGame {
  name: string
  cover_image_url: string | null
  is_expansion: boolean
  designers: string[] | null
  publishers: string[] | null
  year_published: number | null
  bgg_rank: number | null
  bgg_category_rank: { category: string; rank: number } | null
  bgg_avg_rating: string | null
  complexity: string | null
  mechanics: string[] | null
  min_players: number | null
  max_players: number | null
  min_playtime: number | null
  max_playtime: number | null
  min_age: number | null
  rules_pdf_url: string | null
}

export function isCategoryRank(v: unknown): v is { category: string; rank: number } {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof (v as Record<string, unknown>).category === 'string' &&
    typeof (v as Record<string, unknown>).rank === 'number'
  )
}
