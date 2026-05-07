/**
 * Upload route for email-signature photos. Same Vercel Blob bucket as
 * the employee photos but no database writes — we just need a hosted
 * URL we can paste into the signature HTML.
 *
 *   POST /api/admin/signature-photo
 *     multipart/form-data: { file: File }
 *     → { url }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

function blobKey(file: File): string {
  const safe = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `signature-photos/${suffix}-${safe || 'photo.png'}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: 'expected multipart/form-data', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'file too large (max 10 MB)' }, { status: 413 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: `expected image, got ${file.type}` }, { status: 400 });
  }

  try {
    const { url } = await put(blobKey(file), file, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
    });
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = !process.env.BLOB_READ_WRITE_TOKEN
      ? 'BLOB_READ_WRITE_TOKEN is not set on the project.'
      : undefined;
    return NextResponse.json(
      { error: 'blob upload failed', detail: message, hint },
      { status: 500 },
    );
  }
}
