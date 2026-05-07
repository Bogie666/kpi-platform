'use client';

import { Calendar, Code, FileSpreadsheet, Globe, Mail, Wrench, Zap } from 'lucide-react';
import { SectionHead } from '@/components/primitives/section-head';
import { CollapsibleTool } from './collapsible-tool';
import { UnsoldEstimateProcessor } from './unsold-estimate-processor';
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
          icon={FileSpreadsheet}
          iconColorVar="--up"
          title="Unsold Estimate Processor"
          description="Pull unsold estimates for a date range, group by opportunity, export Excel."
        >
          <UnsoldEstimateProcessor />
        </CollapsibleTool>

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

      <div className="flex items-center gap-2 text-[11px] text-muted/70 mt-2">
        <Wrench className="h-3 w-3" />
        <span>All tools run locally — no external admin-api dependency.</span>
      </div>
    </div>
  );
}
