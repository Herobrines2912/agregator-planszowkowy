import { getDb } from '@/db/index'
import { scrapeRuns } from '@/db/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

async function _getLastScrapeTime(): Promise<string | null> {
  const db = getDb()
  const result = await db
    .select({ finished_at: scrapeRuns.finished_at })
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.status, 'success'), isNotNull(scrapeRuns.finished_at)))
    .orderBy(desc(scrapeRuns.finished_at))
    .limit(1)
  return result[0]?.finished_at?.toISOString() ?? null
}

export const getLastScrapeTime = unstable_cache(_getLastScrapeTime, ['last-scrape-time'], {
  revalidate: 7200,
  tags: ['scrape-time'],
})
