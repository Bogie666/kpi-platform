'use client';

import { Calendar, Code, Globe, Mail, Zap } from 'lucide-react';
import { SectionHead } from '@/components/primitives/section-head';
import { CollapsibleTool } from './collapsible-tool';
import { ReviewCarouselEmbed } from './review-carousel-embed';
import { EmailSignatureGenerator } from './email-signature-generator';
import { SchedulerWidget } from './scheduler-widget';
import { SeerSavingsCalculator } from './seer-savings-calculator';
import { SharePointEmbeds } from './sharepoint-embeds';

export function ToolsView() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHead eyebrow="Tools" title="Utilities & embeds" />

      <p className="text-[13px] text-muted leading-relaxed -mt-2 max-w-3xl">
        Operational tools ported from the legacy dashboard. Click any section to expand;
        each tool is self-contained.
      </p>

      <div className="flex flex-col gap-3">
        <CollapsibleTool
          icon={Globe}
          iconColorVar="--d-commercial"
          title="Review Carousel Embed"
          description="Generate WordPress-friendly embed code for the live Google reviews."
        >
          <ReviewCarouselEmbed />
        </CollapsibleTool>

        <CollapsibleTool
          icon={Mail}
          iconColorVar="--warning"
          title="Email Signature Generator"
          description="Build branded HTML signatures for employees with auto-hosted photos."
        >
          <EmailSignatureGenerator />
        </CollapsibleTool>

        <CollapsibleTool
          icon={Calendar}
          iconColorVar="--accent"
          title="Scheduler Widget"
          description="WordPress / embed snippets for the LEX online booking widget."
        >
          <SchedulerWidget />
        </CollapsibleTool>

        <CollapsibleTool
          icon={Zap}
          iconColorVar="--d-plumbing"
          title="SEER Savings Calculator"
          description="Embeddable HVAC energy savings calculator for your website."
        >
          <SeerSavingsCalculator />
        </CollapsibleTool>

        <CollapsibleTool
          icon={Code}
          iconColorVar="--d-hvac_maintenance"
          title="SharePoint Widget Embeds"
          description="Iframe snippets for embedding dashboard surfaces in SharePoint pages."
        >
          <SharePointEmbeds />
        </CollapsibleTool>
      </div>

    </div>
  );
}
