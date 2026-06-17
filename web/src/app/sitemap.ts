import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/config'

// TODO Story 4.5: replace with real DB query from db/queries/game-passport.ts
async function getAllGameSlugsForSitemap(): Promise<string[]> {
  return ['brass-birmingham', 'scythe']
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getAllGameSlugsForSitemap()

  const gameEntries: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${siteUrl}/gra/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    ...gameEntries,
  ]
}
