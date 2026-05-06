/**
 * /api/kpi/reviews/insights — POST { timeframe, locationId } → AI summary.
 * Pulls the reviews from the cache, filters by timeframe + location, sends
 * to Claude for analysis, returns structured insights (praise / complaints
 * / themes / technician mentions / recommendations / sentiment score).
 *
 * Required env: ANTHROPIC_API_KEY.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { googleReviews } from '@/db/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODELS = [process.env.ANTHROPIC_MODEL, 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'].filter(
  (m): m is string => !!m,
);

type Timeframe = '1week' | '2weeks' | '1month' | '3months' | '6months' | 'year';

interface InsightsBody {
  timeframe?: Timeframe;
  locationId?: string;
}

interface ClaudeInsights {
  commonPraise: string[];
  commonComplaints: string[];
  keyThemes: Array<{
    theme: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    frequency: number;
    examples: string[];
  }>;
  technicianMentions: Array<{
    name: string;
    mentions: number;
    sentiment: 'positive' | 'negative' | 'mixed';
    samplePraise?: string;
  }>;
  recommendations: string[];
  sentimentScore: number;
}

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1week': 7,
  '2weeks': 14,
  '1month': 30,
  '3months': 90,
  '6months': 180,
  year: 365,
};

const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  '1week': 'Last week',
  '2weeks': 'Last 2 weeks',
  '1month': 'Last month',
  '3months': 'Last 3 months',
  '6months': 'Last 6 months',
  year: 'Last year',
};

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY env var is not set' },
      { status: 500 },
    );
  }
  let body: InsightsBody = {};
  try {
    body = (await req.json()) as InsightsBody;
  } catch {
    /* allow empty body — defaults below */
  }
  const timeframe = (body.timeframe ?? '3months') as Timeframe;
  const days = TIMEFRAME_MS[timeframe] ?? 90;
  const locationId = body.locationId ?? 'all';

  const cutoff = new Date(Date.now() - days * 86_400_000);
  const database = db();
  const allRows = await database
    .select({
      reviewerName: googleReviews.reviewerName,
      rating: googleReviews.rating,
      reviewText: googleReviews.reviewText,
      locationId: googleReviews.locationId,
      reviewDate: googleReviews.reviewDate,
    })
    .from(googleReviews)
    .orderBy(desc(googleReviews.reviewDate));

  const filtered = allRows.filter(
    (r) =>
      r.reviewDate >= cutoff &&
      (locationId === 'all' || r.locationId === locationId) &&
      (r.reviewText ?? '').trim().length > 0,
  );

  if (filtered.length === 0) {
    return NextResponse.json({
      data: {
        timeframe,
        timeframeLabel: TIMEFRAME_LABEL[timeframe],
        locationId,
        totalReviews: 0,
        avgRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        commonPraise: [],
        commonComplaints: [],
        keyThemes: [],
        technicianMentions: [],
        recommendations: ['No reviews with text content for the selected timeframe and location.'],
        sentimentScore: 0,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  const totalReviews = filtered.length;
  const avgRating = filtered.reduce((s, r) => s + r.rating, 0) / totalReviews;
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const r of filtered) {
    if (r.rating >= 1 && r.rating <= 5) ratingDistribution[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
  }

  const positives = filtered.filter((r) => r.rating >= 4).slice(0, 30);
  const negatives = filtered.filter((r) => r.rating <= 3).slice(0, 20);
  const positiveText = positives.map((r) => r.reviewText).filter(Boolean).join('\n---\n');
  const negativeText = negatives.map((r) => r.reviewText).filter(Boolean).join('\n---\n');

  const prompt = `Analyze these customer reviews for an HVAC, plumbing, and electrical service company.

POSITIVE REVIEWS (${positives.length} total, showing sample):
${positiveText || 'No positive reviews available'}

NEGATIVE/NEUTRAL REVIEWS (${negatives.length} total, showing sample):
${negativeText || 'No negative reviews available'}

Analyze these reviews and provide insights in the following JSON format (return ONLY valid JSON, no markdown):

{
  "commonPraise": ["specific praise 1", ...],
  "commonComplaints": ["specific issue 1", ...],
  "keyThemes": [
    { "theme": "Theme Name", "sentiment": "positive"|"negative"|"neutral", "frequency": <int>, "examples": ["short quote"] }
  ],
  "technicianMentions": [
    { "name": "Tech Name", "mentions": <int>, "sentiment": "positive"|"negative"|"mixed", "samplePraise": "brief quote" }
  ],
  "recommendations": ["actionable recommendation 1", ...],
  "sentimentScore": <0-100>
}

Requirements:
- Extract 5-7 specific things customers praised
- Extract 3-5 specific issues mentioned
- Identify 4-6 key themes with real quotes
- Extract every technician/employee name mentioned by customers, with mention count + sentiment
- Provide 5-7 actionable business recommendations
- Calculate an overall sentiment score (0-100)
- Be specific, reference actual review content
- Return ONLY the JSON object, no other text`;

  const systemPrompt = `You are an expert business analyst specializing in customer feedback analysis for service companies.
You extract specific, actionable insights from customer reviews.
You always respond with valid JSON format only, no markdown formatting or extra text.`;

  let lastErr = 'unknown';
  for (const model of MODELS) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message =
        (errBody as { error?: { message?: string }; message?: string }).error?.message ??
        (errBody as { message?: string }).message ??
        `${res.status} ${res.statusText}`;
      lastErr = message;
      const modelMissing =
        res.status === 400 && /model|not found|unsupported|invalid/i.test(message);
      if (modelMissing) continue;
      return NextResponse.json({ error: `Claude: ${message}` }, { status: 500 });
    }
    const json = (await res.json()) as { content?: Array<{ text?: string }> };
    const raw = (json.content?.[0]?.text ?? '').trim();

    let jsonText = raw;
    const fence = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fence) jsonText = fence[1].trim();
    if (!jsonText.startsWith('{')) {
      const a = jsonText.indexOf('{');
      const b = jsonText.lastIndexOf('}');
      if (a >= 0 && b > a) jsonText = jsonText.slice(a, b + 1);
    }

    let insights: ClaudeInsights;
    try {
      insights = JSON.parse(jsonText) as ClaudeInsights;
    } catch (err) {
      return NextResponse.json(
        {
          error: `Failed to parse AI response: ${err instanceof Error ? err.message : String(err)}`,
          rawResponse: raw.slice(0, 1000),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        timeframe,
        timeframeLabel: TIMEFRAME_LABEL[timeframe],
        locationId,
        totalReviews,
        avgRating: Math.round(avgRating * 10) / 10,
        ratingDistribution,
        ...insights,
        generatedAt: new Date().toISOString(),
        modelUsed: model,
      },
    });
  }

  return NextResponse.json(
    { error: `All Claude models failed. Last error: ${lastErr}` },
    { status: 500 },
  );
}
