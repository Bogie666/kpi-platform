'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CopyButton } from './copy-button';

interface Loc {
  id: string;
  label: string;
  filterValue: string;
  locationLabel: string;
}

const LOCATIONS: Loc[] = [
  { id: 'lex', label: 'Lex', filterValue: 'lex', locationLabel: 'Dallas / Plano, TX' },
  { id: 'lex-etx', label: 'Lex ETX', filterValue: 'lex-etx', locationLabel: 'East Texas' },
  { id: 'lyons', label: 'Lyons', filterValue: 'lyons', locationLabel: 'Rockwall, TX' },
];

function generateClassicSnippet(loc: Loc, apiUrl: string): string {
  const safe = apiUrl.replace(/\/+$/, '');
  return `<div id="ssr-reviews-${loc.id}"></div>
<script>
(function(){
  var CFG = {
    apiUrl: '${safe}',
    location: '${loc.filterValue}',
    minRating: 4,
    maxReviews: 12,
    scrollSpeed: 5000
  };

  var root = document.getElementById('ssr-reviews-${loc.id}');
  if (!root) return;
  root.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Loading reviews...</p>';

  fetch(CFG.apiUrl + '/api/kpi/reviews')
    .then(function(r){ return r.json(); })
    .then(function(json){
      var data = json.data || json;
      var src = data.recent || data.reviews || [];
      var reviews = src
        .filter(function(r){ return r.locationId === CFG.location && r.rating >= CFG.minRating && r.text && r.text.trim(); })
        .sort(function(a,b){ return new Date(b.date) - new Date(a.date); })
        .slice(0, CFG.maxReviews);
      if (!reviews.length) { root.innerHTML = ''; return; }
      render(reviews);
    })
    .catch(function(){ root.innerHTML = ''; });

  var palette = ['#E91E63','#009688','#2196F3','#FF5722','#9C27B0','#4CAF50','#FF9800','#3F51B5'];
  function avatarColor(name){ return palette[Math.abs(hashCode(name)) % palette.length]; }
  function hashCode(s){ var h=0; for(var i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return h; }
  function esc(s){ var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function starSVG(count){
    var google = '<svg viewBox="0 0 24 24" width="24" height="24" style="flex-shrink:0"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';
    var star = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#FBBC05"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';
    return google + new Array(count + 1).join(star);
  }

  function render(reviews){
    var cards = reviews.map(function(r){
      var name = r.name || 'Anonymous';
      var initial = name.charAt(0).toUpperCase();
      var color = avatarColor(name);
      var text = esc(r.text || '');
      var isLong = (r.text || '').length > 220;
      return '<div class="ssr-card">'
        + '<div class="ssr-stars">' + starSVG(r.rating) + '</div>'
        + '<div class="ssr-text' + (isLong ? ' ssr-clamped' : '') + '">' + text + '</div>'
        + (isLong ? '<button class="ssr-see-more">See More</button>' : '')
        + '<div class="ssr-avatar" style="background:' + color + '">' + esc(initial) + '</div>'
        + '<div class="ssr-name">' + esc(name) + '</div>'
        + '</div>';
    }).join('');

    root.innerHTML = '<style>'
      + '.ssr-wrap{position:relative;padding:20px 0;overflow:hidden}'
      + '.ssr-track{display:flex;gap:24px;overflow-x:auto;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:10px 4px}'
      + '.ssr-track::-webkit-scrollbar{display:none}'
      + '.ssr-card{background:#fff;border-radius:12px;border:2px solid #c8e6c9;padding:28px 22px;min-width:280px;max-width:300px;flex:0 0 auto;display:flex;flex-direction:column;align-items:center;text-align:center;box-sizing:border-box;box-shadow:0 2px 12px rgba(0,0,0,.08);transition:transform .2s}'
      + '.ssr-card:hover{transform:translateY(-4px)}'
      + '.ssr-stars{display:flex;align-items:center;gap:3px;margin-bottom:20px}'
      + '.ssr-text{color:#333;font-size:14px;line-height:1.65;margin-bottom:20px;flex-grow:1;overflow:hidden}'
      + '.ssr-text.ssr-clamped{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}'
      + '.ssr-see-more{color:#1a73e8;cursor:pointer;font-size:13px;text-decoration:underline;background:none;border:none;padding:0;margin-bottom:16px;font-family:inherit}'
      + '.ssr-avatar{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;margin-bottom:8px}'
      + '.ssr-name{font-size:13px;font-weight:600;color:#222;text-align:center}'
      + '</style>'
      + '<div class="ssr-wrap"><div class="ssr-track">' + cards + '</div></div>';

    var track = root.querySelector('.ssr-track');
    setInterval(function(){
      if (!track) return;
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 10) track.scrollTo({left:0,behavior:'smooth'});
      else track.scrollBy({left: 300, behavior:'smooth'});
    }, CFG.scrollSpeed);

    root.addEventListener('click', function(e){
      if (!e.target.classList.contains('ssr-see-more')) return;
      var txt = e.target.previousElementSibling;
      txt.classList.toggle('ssr-clamped');
      e.target.textContent = txt.classList.contains('ssr-clamped') ? 'See More' : 'See Less';
    });
  }
})();
</script>`;
}

function generateModernSnippet(loc: Loc, apiUrl: string): string {
  // Modern style — same logic, denser card layout. Trimmed for brevity
  // since the classic snippet covers most use cases.
  const safe = apiUrl.replace(/\/+$/, '');
  return `<div id="ssrm-reviews-${loc.id}"></div>
<script>
(function(){
  var CFG = { apiUrl: '${safe}', location: '${loc.filterValue}', minRating: 4, maxReviews: 12, scrollSpeed: 5000 };
  var root = document.getElementById('ssrm-reviews-${loc.id}');
  if (!root) return;
  fetch(CFG.apiUrl + '/api/kpi/reviews')
    .then(function(r){ return r.json(); })
    .then(function(json){
      var data = json.data || json;
      var src = data.recent || data.reviews || [];
      var reviews = src.filter(function(r){
        return r.locationId === CFG.location && r.rating >= CFG.minRating && r.text && r.text.trim();
      }).sort(function(a,b){ return new Date(b.date) - new Date(a.date); }).slice(0, CFG.maxReviews);
      var avg = reviews.length ? reviews.reduce(function(s,r){return s+r.rating;},0) / reviews.length : 0;
      var byLoc = (data.byLocation || []).find(function(l){ return l.id === CFG.location; });
      var total = byLoc ? (byLoc.reportedTotal || byLoc.count) : reviews.length;
      if (!reviews.length) { root.innerHTML = ''; return; }
      render(reviews, total, avg);
    })
    .catch(function(){ root.innerHTML = ''; });
  function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function relTime(dateStr){
    var diff = Math.floor((new Date() - new Date(dateStr)) / 86400000);
    if (diff < 1) return 'today';
    if (diff < 30) return diff + 'd ago';
    var mo = Math.floor(diff/30);
    if (mo < 12) return mo + 'mo ago';
    return Math.floor(mo/12) + 'y ago';
  }
  function render(reviews, total, avg){
    var stars = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#FBBC05"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';
    var summary = '<div class="ssrm-summary"><div class="ssrm-avg">' + avg.toFixed(1) + '</div>'
      + '<div class="ssrm-stars">' + stars + stars + stars + stars + stars + '</div>'
      + '<div class="ssrm-count"><strong>' + total.toLocaleString() + '</strong> reviews</div></div>';
    var cards = reviews.map(function(r){
      var name = r.name || 'Anonymous';
      var initial = name.charAt(0).toUpperCase();
      return '<div class="ssrm-card">'
        + '<div class="ssrm-card-head"><div class="ssrm-avatar">' + esc(initial) + '</div>'
        + '<div><div class="ssrm-name">' + esc(name) + '</div><div class="ssrm-date">' + relTime(r.date) + '</div></div></div>'
        + '<div class="ssrm-text">' + esc(r.text || '') + '</div></div>';
    }).join('');
    root.innerHTML = '<style>'
      + '.ssrm{display:flex;gap:24px;padding:16px 0;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif}'
      + '.ssrm-summary{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;min-width:160px}'
      + '.ssrm-avg{font-size:36px;font-weight:700;color:#222}'
      + '.ssrm-stars{display:flex;gap:2px;margin:6px 0}'
      + '.ssrm-count{font-size:12px;color:#666}'
      + '.ssrm-track{flex:1;display:flex;gap:16px;overflow-x:auto;padding:8px 4px;scrollbar-width:none}'
      + '.ssrm-track::-webkit-scrollbar{display:none}'
      + '.ssrm-card{background:#f9f9f9;border-radius:10px;padding:16px;min-width:260px;max-width:280px;flex:0 0 auto;box-shadow:0 1px 6px rgba(0,0,0,.08)}'
      + '.ssrm-card-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}'
      + '.ssrm-avatar{width:36px;height:36px;border-radius:50%;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}'
      + '.ssrm-name{font-size:13px;font-weight:600;color:#222}'
      + '.ssrm-date{font-size:11px;color:#999}'
      + '.ssrm-text{font-size:13px;line-height:1.55;color:#444}'
      + '@media(max-width:700px){.ssrm{flex-direction:column}}'
      + '</style><div class="ssrm">' + summary + '<div class="ssrm-track">' + cards + '</div></div>';
    var track = root.querySelector('.ssrm-track');
    setInterval(function(){
      if (!track) return;
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 10) track.scrollTo({left:0,behavior:'smooth'});
      else track.scrollBy({left:280,behavior:'smooth'});
    }, CFG.scrollSpeed);
  }
})();
</script>`;
}

export function ReviewCarouselEmbed() {
  const [apiUrl, setApiUrl] = useState('https://lexkpi.vercel.app');
  const [style, setStyle] = useState<'classic' | 'modern'>('modern');
  const [expanded, setExpanded] = useState(false);

  const getSnippet = (loc: Loc) =>
    style === 'modern' ? generateModernSnippet(loc, apiUrl) : generateClassicSnippet(loc, apiUrl);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-muted leading-relaxed">
        Embeddable review carousel that displays recent 4-5 star Google reviews from this
        dashboard&apos;s API. Copy the snippet for a location and paste it into any
        page on your website. Transparent background.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-eyebrow uppercase text-muted">Dashboard URL</label>
        <input
          type="url"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="https://lexkpi.vercel.app"
          className="w-full bg-surface-2 border border-border rounded-btn px-3 py-2 text-[13px] focus:outline-none focus:border-accent transition-colors"
        />
        <span className="text-[11px] text-muted/80">Base URL of this dashboard (no trailing slash)</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[12px] text-muted">Style:</span>
        <div className="inline-flex bg-surface-2 rounded-btn overflow-hidden border border-border">
          {(['classic', 'modern'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors capitalize ${
                style === s ? 'bg-accent text-bg' : 'text-muted hover:text-text'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {LOCATIONS.map((loc) => (
          <div
            key={loc.id}
            className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-2/40 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold">{loc.label}</span>
                <span className="text-[11px] text-muted">{loc.locationLabel}</span>
              </div>
              <CopyButton text={getSnippet(loc)} label={`Copy ${loc.label}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center justify-between w-full px-4 py-2.5 bg-surface-2 hover:bg-surface-2/80 transition-colors"
        >
          <span className="text-[12px] text-muted">
            Preview embed code (Lex · {style})
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted" />
          )}
        </button>
        {expanded && (
          <pre className="bg-bg text-[11px] text-text/80 p-4 overflow-x-auto max-h-96 overflow-y-auto leading-relaxed border-t border-border">
            <code>{getSnippet(LOCATIONS[0])}</code>
          </pre>
        )}
      </div>

      <div>
        <div className="text-eyebrow uppercase text-muted mb-2">Live preview (Lex · {style})</div>
        <div className="rounded-card border border-border overflow-hidden bg-white">
          <iframe
            srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:10px 0;background:#fff;font-family:Arial,sans-serif;}</style></head><body>${getSnippet(LOCATIONS[0])}</body></html>`}
            title="Review carousel preview"
            className="w-full border-0"
            style={{ height: 360 }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
