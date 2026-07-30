'use client';

import { Code, Mail } from 'lucide-react';
import { SectionHead } from '@/components/primitives/section-head';
import { CollapsibleTool } from './collapsible-tool';
import { EmailSignatureGenerator } from './email-signature-generator';
import { SharePointEmbeds } from './sharepoint-embeds';

export function ToolsView() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHead eyebrow="Tools" title="Utilities & embeds" />

      <p className="text-[13px] text-muted leading-relaxed -mt-2 max-w-3xl">
        Operational tools. Click any section to expand; each tool is self-contained.
      </p>

      <div className="flex flex-col gap-3">
        <CollapsibleTool
          icon={Mail}
          iconColorVar="--warning"
          title="Email Signature Generator"
          description="Build branded HTML signatures for employees with auto-hosted photos."
        >
          <EmailSignatureGenerator />
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
