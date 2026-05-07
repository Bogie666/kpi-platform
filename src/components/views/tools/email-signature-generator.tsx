'use client';

import { useCallback, useRef, useState } from 'react';
import { Camera, Check, Clipboard, Sparkles } from 'lucide-react';

const DEFAULT_PHOTO =
  'https://www.lexairconditioning.com/wp-content/uploads/2026/02/IMG_20260218_214609.png';
const DEFAULT_WEBSITE = 'https://www.lexairconditioning.com';

function buildSignatureHTML(
  photoSrc: string,
  name: string,
  title: string,
  phone: string,
  email: string,
  website: string,
): string {
  const displayName = name || 'Your Name';
  const websiteDisplay = website ? website.replace(/^https?:\/\/(www\.)?/, '') : '';

  const titleRow = title
    ? `\n        <tr>\n          <td style="padding-bottom:4px;">\n            <span style="font-family:Arial,sans-serif;font-size:11px;font-weight:600;color:#c9a84c;letter-spacing:2px;text-transform:uppercase;">${title}</span>\n          </td>\n        </tr>`
    : '';
  const phoneRow = phone
    ? `\n        <tr>\n          <td style="padding-bottom:5px;">\n            <span style="color:#1a2b5e;font-size:10px;">&#9679;&nbsp;</span><a href="tel:${phone.replace(/\D/g, '')}" style="font-family:Arial,sans-serif;font-size:13px;color:#3a4a62;text-decoration:none;">${phone}</a>\n          </td>\n        </tr>`
    : '';
  const emailRow = email
    ? `\n        <tr>\n          <td style="padding-bottom:5px;">\n            <span style="color:#1a2b5e;font-size:10px;">&#9679;&nbsp;</span><a href="mailto:${email}" style="font-family:Arial,sans-serif;font-size:13px;color:#3a4a62;text-decoration:none;">${email}</a>\n          </td>\n        </tr>`
    : '';
  const websiteRow = website
    ? `\n        <tr>\n          <td>\n            <span style="color:#1a2b5e;font-size:10px;">&#9679;&nbsp;</span><a href="${website}" target="_blank" style="font-family:Arial,sans-serif;font-size:13px;color:#3a4a62;text-decoration:none;">${websiteDisplay}</a>\n          </td>\n        </tr>`
    : '';

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,sans-serif;">
  <tr>
    <td colspan="4" style="padding-bottom:12px;font-size:0;line-height:0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
        <tr><td style="height:3px;background-color:#c9a84c;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td valign="top" style="vertical-align:top;">
      <img src="${photoSrc}" alt="${displayName}" width="130" height="165" style="display:block;border-radius:6px;width:130px;height:165px;object-fit:cover;object-position:center top;" />
    </td>
    <td style="width:20px;">&nbsp;</td>
    <td style="width:2px;background:linear-gradient(to bottom,#c9a84c,#1a2b5e);padding:0;">&nbsp;</td>
    <td valign="top" style="padding-left:20px;vertical-align:top;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding-bottom:${title ? '2px' : '8px'};">
            <span style="font-family:'Barlow Condensed',Arial,sans-serif;font-size:22px;font-weight:700;color:#0d1a2e;letter-spacing:0.5px;line-height:1;">${displayName}</span>
          </td>
        </tr>${titleRow}
        <tr>
          <td style="padding-bottom:16px;">
            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td valign="middle">
                  <img src="https://www.lexairconditioning.com/wp-content/uploads/2024/01/cropped-lex-logo@2x.png" alt="LEX Air Conditioning" height="38" style="display:block;height:38px;width:auto;" />
                </td>
                <td valign="middle" style="padding-left:10px;border-left:1px solid #d0d8e8;">
                  <span style="font-family:Arial,sans-serif;font-size:10px;color:#8a9ab5;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;">The Gold Standard of White Glove Service</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>${phoneRow}${emailRow}${websiteRow}
      </table>
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
  const previewRef = useRef<HTMLDivElement | null>(null);

  const getPhotoSrc = useCallback(() => {
    if (photoUrl) return photoUrl;
    if (photoDataUrl) return photoDataUrl;
    return DEFAULT_PHOTO;
  }, [photoUrl, photoDataUrl]);

  const signatureHTML = generated
    ? buildSignatureHTML(getPhotoSrc(), fullName, jobTitle, phone, email, website)
    : '';

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
      // Reuse the existing employee-photo blob endpoint — it's already
      // wired to Vercel Blob and accepts arbitrary image uploads under
      // an employee name; here we just pass the file's basename.
      const form = new FormData();
      form.append('file', file);
      form.append('employeeName', `signature-${file.name}`);
      const res = await fetch('/api/admin/employee-photo', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(j.detail ?? j.error ?? `${res.status}`);
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
    const html = buildSignatureHTML(getPhotoSrc(), fullName, jobTitle, phone, email, website);
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
            <span className="text-[11px] text-[#6b7280] ml-1">New Message — Gmail</span>
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
          <h4 className="text-eyebrow uppercase text-accent mb-3">How to install in Gmail</h4>
          <ol className="flex flex-col gap-2 text-[13px] text-muted">
            {[
              'Click Generate Signature, then Copy Signature above.',
              'Open Gmail → Settings ⚙ → See all settings → Signature.',
              'Click Create new, name it, then paste with Ctrl+V / ⌘V.',
              'Set as default and click Save Changes.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="h-5 w-5 rounded-full bg-surface-2 border border-border text-accent text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
