'use client';

import { useCallback, useRef, useState } from 'react';
import { Camera, Check, Clipboard, Sparkles } from 'lucide-react';

const DEFAULT_PHOTO =
  'https://www.lexairconditioning.com/wp-content/uploads/2026/02/IMG_20260218_214609.png';
const DEFAULT_WEBSITE = 'https://www.lexairconditioning.com';

interface SignatureOpts {
  withPhoto: boolean;
  photoSrc: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  website: string;
}

const COMPANY_LINE = 'LEX - Air Conditioning, Heating, Plumbing &amp; Electrical';
const TAGLINE = 'The Gold Standard of White Glove Service.';

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Body table — name, title, optional company line, P/E/W rows, tagline.
 *  When the photo variant is used, the body includes the company name
 *  line. When the no-photo variant is used, the LEX logo on the left
 *  conveys the company so the line is omitted to avoid redundancy. */
function buildBodyHTML(
  opts: Pick<SignatureOpts, 'name' | 'title' | 'phone' | 'email' | 'website'>,
  options: { includeCompanyLine: boolean },
): string {
  const displayName = escapeHTML(opts.name || 'Your Name');
  const title = opts.title ? escapeHTML(opts.title) : '';
  const websiteDisplay = opts.website ? opts.website.replace(/^https?:\/\/(www\.)?/, '') : '';

  const titleRow = title
    ? `<tr><td style="font-family: Arial, sans-serif; font-size: 13px; color: #C8A851; font-weight: 600; padding-bottom: 8px; letter-spacing: 0.3px;">${title}</td></tr>`
    : '';
  const companyRow = options.includeCompanyLine
    ? `<tr><td style="font-family: Arial, sans-serif; font-size: 13px; color: #003366; font-weight: 700; padding-bottom: 10px;">${COMPANY_LINE}</td></tr>`
    : '';
  const phoneRow = opts.phone
    ? `<tr><td style="font-family: Arial, sans-serif; font-size: 12px; color: #555555; padding-bottom: 4px;"><span style="color: #C8A851; font-weight: 700;">P</span>&nbsp;&nbsp;<a href="tel:${opts.phone.replace(/\D/g, '')}" style="color: #555555; text-decoration: none;">${escapeHTML(opts.phone)}</a></td></tr>`
    : '';
  const emailRow = opts.email
    ? `<tr><td style="font-family: Arial, sans-serif; font-size: 12px; color: #555555; padding-bottom: 4px;"><span style="color: #C8A851; font-weight: 700;">E</span>&nbsp;&nbsp;<a href="mailto:${escapeHTML(opts.email)}" style="color: #555555; text-decoration: none;">${escapeHTML(opts.email)}</a></td></tr>`
    : '';
  const websiteRow = opts.website
    ? `<tr><td style="font-family: Arial, sans-serif; font-size: 12px; color: #555555; padding-bottom: 10px;"><span style="color: #C8A851; font-weight: 700;">W</span>&nbsp;&nbsp;<a href="${escapeHTML(opts.website)}" style="color: #555555; text-decoration: none;">${escapeHTML(websiteDisplay)}</a></td></tr>`
    : '';

  return `<table cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-family: 'Montserrat', Arial, sans-serif; font-size: 18px; font-weight: 700; color: #003366; padding-bottom: 2px;">${displayName}</td></tr>
        ${titleRow}
        ${companyRow}
        ${phoneRow}
        ${emailRow}
        ${websiteRow}
        <tr><td style="font-family: Arial, sans-serif; font-size: 11px; color: #888888; font-style: italic; border-top: 1px solid #e5e7eb; padding-top: 8px;">${TAGLINE}</td></tr>
      </table>`;
}

function buildSignatureHTML(opts: SignatureOpts): string {
  if (!opts.withPhoto) {
    // No personal photo — show the LEX logo in the left cell instead.
    // The logo conveys the company so we omit the redundant company-name
    // line from the body.
    const body = buildBodyHTML(opts, { includeCompanyLine: false });
    return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; color: #333333; border-collapse: collapse;">
  <tr>
    <td style="padding: 0 20px 0 0; vertical-align: middle; border-right: 3px solid #C8A851;">
      <img src="https://www.lexairconditioning.com/wp-content/uploads/2024/01/lex-logo@2x.png" alt="LEX Air Conditioning, Heating, Plumbing &amp; Electrical" width="160" height="84" style="display: block; border: 0;">
    </td>
    <td style="padding: 0 0 0 20px; vertical-align: top; line-height: 1.4;">
      ${body}
    </td>
  </tr>
</table>`;
  }

  // Photo variant — drop the company-name line and use a larger
  // headshot so the left and right columns balance visually.
  const body = buildBodyHTML(opts, { includeCompanyLine: false });
  const photoSrc = escapeHTML(opts.photoSrc);
  const altName = escapeHTML(opts.name || 'Photo');
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; color: #333333; border-collapse: collapse;">
  <tr>
    <td style="padding: 0 20px 0 0; vertical-align: middle; border-right: 3px solid #C8A851;">
      <img src="${photoSrc}" alt="${altName}" width="140" height="140" style="display: block; border-radius: 50%; border: 0;">
    </td>
    <td style="padding: 0 0 0 20px; vertical-align: middle; line-height: 1.4;">
      ${body}
    </td>
  </tr>
</table>`;
}

export function EmailSignatureGenerator() {
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(DEFAULT_WEBSITE);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoFileName, setPhotoFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [withPhoto, setWithPhoto] = useState(true);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const getPhotoSrc = useCallback(() => {
    if (photoUrl) return photoUrl;
    if (photoDataUrl) return photoDataUrl;
    return DEFAULT_PHOTO;
  }, [photoUrl, photoDataUrl]);

  const buildOpts = useCallback(
    (): SignatureOpts => ({
      withPhoto,
      photoSrc: getPhotoSrc(),
      name: fullName,
      title: jobTitle,
      phone,
      email,
      website,
    }),
    [withPhoto, getPhotoSrc, fullName, jobTitle, phone, email, website],
  );

  const signatureHTML = generated ? buildSignatureHTML(buildOpts()) : '';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File must be < 5 MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image');
      return;
    }
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = (ev.target?.result as string | undefined) ?? '';
      setPhotoDataUrl(result);
      setPhotoFileName(file.name);
    };
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      // Dedicated signature-photo route — uploads to the same Vercel
      // Blob bucket as technician headshots, but doesn't write any
      // employees-table row. Auth-gated via the shared admin secret.
      const form = new FormData();
      form.append('file', file);
      // Public endpoint (any employee, no admin login required) — gated
      // only by same-origin referer + size/type limits.
      const res = await fetch('/api/tools/signature-photo', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          hint?: string;
        };
        const detail = j.detail ?? j.error ?? `${res.status}`;
        throw new Error(j.hint ? `${detail} — ${j.hint}` : detail);
      }
      const json = (await res.json()) as { url?: string };
      if (json.url) setPhotoUrl(json.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleCopy = async () => {
    const html = buildSignatureHTML(buildOpts());
    try {
      if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      }
    } catch {
      /* fall through */
    }
    if (previewRef.current) {
      const range = document.createRange();
      range.selectNode(previewRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('copy');
      sel?.removeAllRanges();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const inputClass =
    'w-full bg-surface-2 border border-border rounded-btn px-3 py-2 text-[13px] focus:outline-none focus:border-accent transition-colors';
  const labelClass = 'block text-eyebrow uppercase text-muted mb-1';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <div className="flex flex-col gap-4">
        {/* With-photo / no-photo toggle */}
        <div className="flex items-center gap-2">
          <span className="text-eyebrow uppercase text-muted">Style</span>
          <div className="inline-flex bg-surface-2 rounded-btn overflow-hidden border border-border">
            <button
              type="button"
              onClick={() => setWithPhoto(true)}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                withPhoto ? 'bg-accent text-bg' : 'text-muted hover:text-text'
              }`}
            >
              With photo
            </button>
            <button
              type="button"
              onClick={() => setWithPhoto(false)}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                !withPhoto ? 'bg-accent text-bg' : 'text-muted hover:text-text'
              }`}
            >
              Text only
            </button>
          </div>
        </div>

        {withPhoto && (
          <>
            <div className="flex items-center gap-2 text-eyebrow uppercase text-accent">
              <span>Photo</span>
              <span className="flex-1 h-px bg-border" />
            </div>
            <label
              className={`block border-2 border-dashed rounded-btn p-5 text-center cursor-pointer transition-colors ${
                photoDataUrl ? 'border-accent/70' : 'border-border hover:border-accent/60 hover:bg-accent/5'
              }`}
            >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {photoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="flex flex-col items-center gap-2">
              <img
                src={photoDataUrl}
                alt="Preview"
                className="w-20 h-24 object-cover object-top rounded border-2 border-accent"
              />
              <span className="text-[11px] text-muted">{photoFileName}</span>
              {uploading && <span className="text-[11px] text-accent">Uploading…</span>}
              {!uploading && photoUrl && (
                <span className="text-[11px] text-up">Hosted and ready</span>
              )}
              {uploadError && <span className="text-[11px] text-down">{uploadError}</span>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Camera className="h-6 w-6 text-muted" />
              <div className="text-[13px] text-muted">
                <span className="text-accent font-semibold">Click to upload</span> your headshot
              </div>
              <div className="text-[11px] text-muted/80">JPG / PNG · auto-hosted on Vercel Blob</div>
            </div>
          )}
        </label>
        <div>
          <label className={labelClass}>
            Photo URL{' '}
            {photoUrl && !uploading && <span className="normal-case text-up">(auto-filled)</span>}
          </label>
          <input
            type="url"
            className={inputClass}
            placeholder="https://yoursite.com/photo.jpg"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
          />
        </div>
          </>
        )}

        <div className="flex items-center gap-2 text-eyebrow uppercase text-accent pt-2">
          <span>Your info</span>
          <span className="flex-1 h-px bg-border" />
        </div>
        <div>
          <label className={labelClass}>Full Name</label>
          <input
            className={inputClass}
            placeholder="e.g. John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={inputClass}
            placeholder="e.g. Operations Manager"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            className={inputClass}
            placeholder="(555) 555-5555"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            className={inputClass}
            placeholder="jdoe@lexairconditioning.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Website</label>
          <input
            type="url"
            className={inputClass}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={() => setGenerated(true)}
          className="inline-flex items-center justify-center gap-2 mt-2 py-2.5 rounded-btn bg-accent text-bg font-semibold text-[13px] uppercase tracking-widest hover:opacity-90 transition-opacity"
        >
          <Sparkles className="h-4 w-4" />
          Generate Signature
        </button>
      </div>

      {/* Preview */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-eyebrow uppercase text-muted">Live preview</span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!generated}
            className={`inline-flex items-center gap-2 text-[12px] font-semibold px-3 py-1.5 rounded-btn border transition-colors ${
              copied
                ? 'border-up text-up bg-up-bg'
                : generated
                  ? 'border-border hover:border-accent hover:text-accent'
                  : 'border-border text-muted opacity-40 cursor-not-allowed'
            }`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy signature'}
          </button>
        </div>

        <div className="rounded-card overflow-hidden bg-[#f3f4f6] shadow-2xl">
          <div className="bg-[#e2e4e8] px-4 py-2 flex items-center gap-2 border-b border-[#d0d3d8]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#9ca3af]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#9ca3af]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#9ca3af]" />
            <span className="text-[11px] text-[#6b7280] ml-1">New Message — Outlook</span>
          </div>
          <div className="bg-white px-5 py-2 border-b border-[#e5e7eb]">
            <div className="text-[12px] text-[#9ca3af] py-1 border-b border-[#f3f4f6]">To</div>
            <div className="text-[12px] text-[#9ca3af] py-1">Subject</div>
          </div>
          <div className="bg-white p-5 min-h-[200px]">
            {generated ? (
              <div ref={previewRef} dangerouslySetInnerHTML={{ __html: signatureHTML }} />
            ) : (
              <div className="text-center py-12 text-[#9ca3af]">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-[13px]">
                  Fill in your info and click <strong>Generate Signature</strong>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface-2/40 p-4">
          <h4 className="text-eyebrow uppercase text-accent mb-3">How to install in Outlook</h4>
          <ol className="flex flex-col gap-2 text-[13px] text-muted">
            {[
              'Click Generate Signature, then Copy Signature above.',
              'In Outlook, open File → Options → Mail → Signatures.',
              'Click New, name it, then paste with Ctrl+V into the editor.',
              'Set as default for new messages + replies, click OK to save.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="h-5 w-5 rounded-full bg-surface-2 border border-border text-accent text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-muted/80 mt-3 leading-relaxed">
            New Outlook / Outlook on the web: Settings ⚙ → <em>Mail → Compose and reply →
            Email signatures</em>. Add new, paste, set as default, save.
          </p>
        </div>
      </div>
    </div>
  );
}
