/**
 * /api/kpi/reviews — aggregates google_reviews into the shape the
 * Engagement → Reviews tab expects: hero stats, star distribution,
 * 12-month trend, recent reviews, per-location breakdown.
 *
 * No window filter — Google reviews are sparse enough that we always
 * show the all-time hero. The 12-month trend is derived in JS from
 * the cached rows; recent reviews come back DESC by reviewDate.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { googleReviews, googleReviewsSyncStatus } from '@/db/schema';

export const dynamic = 'force-dynamic';

export interface ReviewsResponse {
  total: number;
  avgRating: number;
  /** Counts per star bucket. */
  ratingDist: { 1: number; 2: number; 3: number; 4: number; 5: number };
  /** 12-month trend — newest last. */
  trend: Array<{ month: string; count: number; avgRating: number }>;
  /** Recent reviews, newest first. */
  recent: Array<{
    id: string;
    name: string;
    rating: number;
    text: string;
    reply: string | null;
    locationId: string;
    locationName: string;
    date: string;
  }>;
  byLocation: Array<{
    id: string;
    name: string;
    count: number;
    avgRating: number;
    /** Google's reported total (may be higher than fetched). */
    reportedTotal: number | null;
  }>;
  lastSync: {
    at: string | null;
    status: string | null;
    totalSynced: number | null;
    error: string | null;
  };
}

interface SyncStatusRow {
  fetched?: Record<string, number>;
  reported?: Record<string, number>;
}

export async function GET(_req: NextRequest) {
  const database = db();

  const [allRows, syncStatusRows] = await Promise.all([
    database
      .select({
        reviewId: googleReviews.reviewId,
        reviewerName: googleReviews.reviewerName,
        rating: googleReviews.rating,
        reviewText: googleReviews.reviewText,
        reviewReply: googleReviews.reviewReply,
        locationId: googleReviews.locationId,
        locationName: googleReviews.locationName,
        reviewDate: googleReviews.reviewDate,
      })
      .from(googleReviews)
      .orderBy(desc(googleReviews.reviewDate)),
    database
      .select()
      .from(googleReviewsSyncStatus)
      .orderBy(desc(googleReviewsSyncStatus.lastSyncAt))
      .limit(1),
  ]);

  const total = allRows.length;
  const sumRating = allRows.reduce((s, r) => s + r.rating, 0);
  const avgRating = total > 0 ? sumRating / total : 0;

  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const r of allRows) {
    if (r.rating >= 1 && r.rating <= 5) ratingDist[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
  }

  // 12-month trend — keys are YYYY-MM in the user's view.
  const monthKeys = monthKeysBefore(new Date(), 12);
  const monthAgg = new Map<string, { count: number; sum: number }>();
  for (const r of allRows) {
    const key = `${r.reviewDate.getUTCFullYear()}-${String(r.reviewDate.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!monthAgg.has(key)) monthAgg.set(key, { count: 0, sum: 0 });
    const m = monthAgg.get(key)!;
    m.count += 1;
    m.sum += r.rating;
  }
  const trend = monthKeys.map((k) => {
    const m = monthAgg.get(k);
    return {
      month: k,
      count: m?.count ?? 0,
      avgRating: m && m.count > 0 ? m.sum / m.count : 0,
    };
  });

  // Recent — already DESC sorted by reviewDate.
  const recent = allRows.slice(0, 24).map((r) => ({
    id: r.reviewId,
    name: r.reviewerName ?? 'Anonymous',
    rating: r.rating,
    text: r.reviewText ?? '',
    reply: r.reviewReply,
    locationId: r.locationId,
    locationName: r.locationName,
    date: r.reviewDate.toISOString(),
  }));

  // Per-location rollup. We also pull Google's reportedTotal from the
  // sync status row when available so the UI can show the "real" total
  // even if pagination dropped reviews.
  const locAgg = new Map<string, { name: string; count: number; sum: number }>();
  for (const r of allRows) {
    if (!locAgg.has(r.locationId)) locAgg.set(r.locationId, { name: r.locationName, count: 0, sum: 0 });
    const a = locAgg.get(r.locationId)!;
    a.count += 1;
    a.sum += r.rating;
  }
  const status = syncStatusRows[0];
  const reportedTotals = (status?.locationStats as SyncStatusRow | null)?.reported ?? {};
  const byLocation = Array.from(locAgg.entries()).map(([id, a]) => ({
    id,
    name: a.name,
    count: a.count,
    avgRating: a.count > 0 ? a.sum / a.count : 0,
    reportedTotal: reportedTotals[id] ?? null,
  }));

  const body: ReviewsResponse = {
    total,
    avgRating,
    ratingDist,
    trend,
    recent,
    byLocation,
    lastSync: {
      at: status?.lastSyncAt?.toISOString() ?? null,
      status: status?.syncStatus ?? null,
      totalSynced: status?.totalReviewsSynced ?? null,
      error: status?.errorMessage ?? null,
    },
  };

  return NextResponse.json({ data: body });
}

function monthKeysBefore(asOf: Date, n: number): string[] {
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

void sql;
