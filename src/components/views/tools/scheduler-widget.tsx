'use client';

import { ExternalLink } from 'lucide-react';
import { CopyButton } from './copy-button';

const WORDPRESS_CODE = `<!-- LEX Scheduler Widget -->
<link rel="stylesheet" href="https://scheduler-mu-three.vercel.app/lex-scheduler.css">
<script>
  window.LEXSchedulerConfig = {
    apiEndpoint: 'https://scheduler-mu-three.vercel.app/api/lex-booking',
    autoButton: true,
    buttonText: 'Book Online',
    position: 'bottom-right'
  };
</script>
<script src="https://scheduler-mu-three.vercel.app/lex-scheduler.iife.js"></script>`;

const EMBED_BOX_CODE = `<div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
  <h2 style="margin: 0 0 16px; font-size: 20px; color: #0e2a4a;">Schedule Service Online</h2>
  <p style="color: #64748b; line-height: 1.7; margin: 0 0 16px;">
    Need HVAC, plumbing, or electrical service? Click the button below to schedule an appointment.
  </p>
  <button onclick="LEXScheduler.open()" style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: #133865; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">
    Book Appointment Now
  </button>
</div>`;

const CONFIG_CODE = `{
  // URL to backend API that handles ServiceTitan integration
  apiEndpoint: '/api/lex-booking',

  // Show floating button automatically
  autoButton: true,

  // Text for the floating button
  buttonText: 'Book Online',

  // Button position: 'bottom-right' or 'bottom-left'
  position: 'bottom-right',

  // CSS selector for existing buttons to trigger the scheduler
  buttonSelector: '.book-online-btn',

  // Custom logo URL (defaults to LEX logo if not set)
  logoUrl: 'https://example.com/your-logo.png',

  // Header background color (default: '#133865')
  headerColor: '#133865',

  // Floating button color (default: '#0A5C8C')
  buttonColor: '#0A5C8C',

  // Footer tagline text
  tagline: 'The Gold Standard of White Glove Service',

  // Support phone number (shown in footer and confirmation)
  phoneNumber: '(972) 466-1917'
}`;

const MANUAL_CONTROL_CODE = `// Open the scheduler
LEXScheduler.open();

// Close the scheduler
LEXScheduler.close();

// Toggle open/closed
LEXScheduler.toggle();`;

const BLOCKS = [
  { label: 'WordPress installation', code: WORDPRESS_CODE },
  { label: 'Embeddable schedule box', code: EMBED_BOX_CODE },
  { label: 'Configuration options', code: CONFIG_CODE },
  { label: 'Manual control (JavaScript)', code: MANUAL_CONTROL_CODE },
];

export function SchedulerWidget() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-muted leading-relaxed flex-1">
          Embeddable scheduling widget that integrates with ServiceTitan for online
          booking. Drop the WordPress snippet on any page; the floating button pops a
          fully-branded scheduler over the page.
        </p>
        <a
          href="https://scheduler-mu-three.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-accent hover:opacity-80 transition-opacity shrink-0"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Live preview
        </a>
      </div>

      {BLOCKS.map((b) => (
        <div key={b.label} className="rounded-card border border-border overflow-hidden">
          <div className="flex items-center justify-between bg-surface-2 px-4 py-2">
            <span className="text-[12px] font-medium">{b.label}</span>
            <CopyButton text={b.code} />
          </div>
          <pre className="bg-bg text-[11px] text-text/90 p-4 overflow-x-auto whitespace-pre leading-relaxed border-t border-border">
            <code>{b.code}</code>
          </pre>
        </div>
      ))}
    </div>
  );
}
