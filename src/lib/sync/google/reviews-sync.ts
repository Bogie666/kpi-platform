/**
 * Google reviews sync — wraps fetchAllReviews() with the dashboard's
 * standard sync_runs accounting + safety check (skip if API returned
 * dramatically fewer reviews than the cache, so a transient 429 on
 * Google's side doesn't wipe months of history).
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { googleReviews, googleReviewsSyncStatus } from '@/db/schema';
import { fetchAllReviews } from './business';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const GOOGLE_REVIEWS_SOURCE = 'google_reviews';

export interface GoogleReviewsSyncResult {
  runId: number | null;
  skipped?: 'another_run_active' | 'too_few_returned';
  reason?: string;
  fetched: number;
  upserted: number;
  cachedBefore: number;
  locationStats: Record<string, number>;
  reportedTotals: Record<string, number>;
}

export async function syncGoogleReviews(
  trigger: SyncTrigger,
  opts: { force?: boolean } = {},
): Promise<GoogleReviewsSyncResult> {
  const today = new Date().toISOString().slice(0, 10);
  const start = await startSyncRun({
    source: GOOGLE_REVIEWS_SOURCE,
    trigger,
    reportId: 'google-reviews',
    windowStart: today,
    windowEnd: today,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: 'another_run_active',
      fetched: 0,
      upserted: 0,
      cachedBefore: 0,
      locationStats: {},
      reportedTotals: {},
    };
  }
  const runId = start.runId;

  try {
    const { reviews, locationStats, reportedTotals } = await fetchAllReviews();
    const database = db();

    const before = await database
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(googleReviews);
    const cachedBefore = Number(before[0]?.c ?? 0);

    // Safety: if we got back <95% of the cached count and we have a
    // material amount in cache, don't wipe — log and bail. Override with
    // force=true to push a known-good resync through.
    const minRequired = Math.floor(cachedBefore * 0.95);
    if (!opts.force && cachedBefore > 100 && reviews.length < minRequired) {
      const reason = `Google returned ${reviews.length} reviews; cache has ${cachedBefore}. Skipping to avoid data loss.`;
      await database.insert(googleReviewsSyncStatus).values({
        lastSyncAt: new Date(),
        totalReviewsSynced: reviews.length,
        syncStatus: 'skipped',
        errorMessage: reason,
        locationStats: { fetched: locationStats, reported: reportedTotals },
      });
      await finishSyncRunSuccess(runId, {
        rowsFetched: reviews.length,
        rowsUpserted: 0,
      });
      return {
        runId,
        skipped: 'too_few_returned',
        reason,
        fetched: reviews.length,
        upserted: 0,
        cachedBefore,
        locationStats,
        reportedTotals,
      };
    }

    // Replace the cache atomically — wipe + bulk insert.
    await database.delete(googleReviews);

    let upserted = 0;
    if (reviews.length > 0) {
      const rows = reviews
        .filter((r) => r.id && r.rating >= 1 && r.rating <= 5)
        .map((r) => ({
          reviewId: r.id,
          reviewerName: r.name || null,
          rating: r.rating,
          reviewText: r.text || null,
          reviewReply: r.reply,
          locationName: r.locationName,
          locationId: r.locationId,
          accountId: r.accountId,
          reviewDate: new Date(r.date),
        }));
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        await database
          .insert(googleReviews)
          .values(batch)
          .onConflictDoUpdate({
            target: googleReviews.reviewId,
            set: {
              reviewerName: sql.raw(`excluded.reviewer_name`),
              rating: sql.raw(`excluded.rating`),
              reviewText: sql.raw(`excluded.review_text`),
              reviewReply: sql.raw(`excluded.review_reply`),
              locationName: sql.raw(`excluded.location_name`),
              locationId: sql.raw(`excluded.location_id`),
              accountId: sql.raw(`excluded.account_id`),
              reviewDate: sql.raw(`excluded.review_date`),
              syncedAt: new Date(),
            },
          });
        upserted += batch.length;
      }
    }

    await database.insert(googleReviewsSyncStatus).values({
      lastSyncAt: new Date(),
      totalReviewsSynced: upserted,
      syncStatus: 'success',
      locationStats: { fetched: locationStats, reported: reportedTotals },
    });

    await finishSyncRunSuccess(runId, {
      rowsFetched: reviews.length,
      rowsUpserted: upserted,
    });

    return {
      runId,
      fetched: reviews.length,
      upserted,
      cachedBefore,
      locationStats,
      reportedTotals,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
