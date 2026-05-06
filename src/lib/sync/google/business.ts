/**
 * Thin client over the legacy Google My Business v4 reviews endpoint.
 * Iterates the three monitored Lex locations (Plano / Tyler / Lyons),
 * paginates each fully, and returns the union plus per-location stats
 * (both fetched count and Google's reported total — they sometimes
 * disagree because of pagination quirks on Google's side).
 */
import { getTokenManager } from './token-manager';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RawReview {
  id: string;
  name: string;
  rating: number;
  text: string;
  reply: string | null;
  locationName: string;
  /** Friendly identifier — 'lex' / 'lex-etx' / 'lyons'. */
  locationId: string;
  accountId: string;
  date: string;
}

interface Location {
  accountId: string;
  locationId: string;
  title: string;
  identifier: string;
}

const LOCATIONS: Location[] = [
  // Lex (Dallas/Plano) — 901 Jupiter Rd
  { accountId: '102262219515631457064', locationId: '2211062401809147654', title: 'Lex Air Conditioning', identifier: 'lex' },
  // Lex ETX (East Texas) — Tyler, TX
  { accountId: '102262219515631457064', locationId: '7913826327010230630', title: 'LEX ETX', identifier: 'lex-etx' },
  // Lyons — Rockwall
  { accountId: '104110704176658195109', locationId: '379116535546276113', title: 'Lyons Air Conditioning and Heating', identifier: 'lyons' },
];

const STAR_NUM: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export interface FetchResult {
  reviews: RawReview[];
  /** Per-location count we successfully fetched. */
  locationStats: Record<string, number>;
  /** What Google reports as totalReviewCount on the first page. May be
   *  larger than what we actually got back (pagination flakiness). */
  reportedTotals: Record<string, number>;
}

async function fetchPage(
  url: string,
  token: string,
  retries = 3,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status?: number; error: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) return { ok: true, data: (await res.json()) as Record<string, unknown> };
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 10_000));
        continue;
      }
      return { ok: false, status: res.status, error: await res.text().catch(() => '') };
    } catch (err) {
      if (attempt < retries) {
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 10_000));
        continue;
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: false, error: 'max retries' };
}

export async function fetchAllReviews(): Promise<FetchResult> {
  const token = await getTokenManager().getAccessToken();
  const reviews: RawReview[] = [];
  const locationStats: Record<string, number> = {};
  const reportedTotals: Record<string, number> = {};

  for (const loc of LOCATIONS) {
    let pageToken: string | undefined;
    let count = 0;
    let pageNum = 0;
    while (true) {
      pageNum++;
      const url = pageToken
        ? `https://mybusiness.googleapis.com/v4/accounts/${loc.accountId}/locations/${loc.locationId}/reviews?pageSize=50&pageToken=${pageToken}`
        : `https://mybusiness.googleapis.com/v4/accounts/${loc.accountId}/locations/${loc.locationId}/reviews?pageSize=50`;
      if (pageNum > 1) await sleep(200);
      const res = await fetchPage(url, token);
      if (!res.ok) {
        console.warn(`google reviews ${loc.title} page ${pageNum}: ${res.status ?? '?'} ${res.error.slice(0, 200)}`);
        break;
      }
      const body = res.data;
      if (typeof body.totalReviewCount === 'number' && reportedTotals[loc.identifier] === undefined) {
        reportedTotals[loc.identifier] = body.totalReviewCount;
      }
      const items = body.reviews as
        | Array<{
            reviewId?: string;
            name?: string;
            reviewer?: { displayName?: string };
            starRating?: string;
            comment?: string;
            reviewReply?: { comment?: string };
            createTime?: string;
          }>
        | undefined;
      if (items?.length) {
        for (const r of items) {
          reviews.push({
            id: r.reviewId || r.name || '',
            name: r.reviewer?.displayName || 'Anonymous',
            rating: r.starRating ? STAR_NUM[r.starRating] ?? 0 : 0,
            text: r.comment || '',
            reply: r.reviewReply?.comment || null,
            locationName: loc.title,
            locationId: loc.identifier,
            accountId: loc.accountId,
            date: r.createTime || new Date().toISOString(),
          });
          count++;
        }
      }
      pageToken = body.nextPageToken as string | undefined;
      if (!pageToken) break;
    }
    locationStats[loc.identifier] = count;
  }

  return { reviews, locationStats, reportedTotals };
}

export const REVIEW_LOCATIONS = LOCATIONS.map((l) => ({ id: l.identifier, name: l.title }));
