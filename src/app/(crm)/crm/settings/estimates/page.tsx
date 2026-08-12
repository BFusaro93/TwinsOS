"use client";

import { toast } from "sonner";
import { EstimateTemplatesList } from "@/components/crm/estimates/EstimateTemplatesList";
import { EstimateDisplaySettingsPanel } from "@/components/crm/estimates/EstimateDisplaySettingsPanel";
import { EmailTemplatesEditor } from "@/components/crm/settings/EmailTemplatesEditor";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { getOrgDefaultDisplaySettings } from "@/lib/estimate-display-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMAIL_MERGE_TAGS } from "@/types/crm-proposals";

// ─── Client View defaults ───────────────────────────────────────────────────

function ClientViewDefaultsPanel() {
  const { data: orgSettings, isLoading } = useOrgSettings();
  const { mutateAsync: updateOrgSettings } = useUpdateOrgSettings();

  if (isLoading || !orgSettings) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  const settings = getOrgDefaultDisplaySettings(orgSettings.customizations);

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Default display settings for brand-new estimates that don&apos;t use a template. A template&apos;s own
        Client View settings always take priority over these when one is selected.
      </p>
      <EstimateDisplaySettingsPanel
        title="Company-wide client view defaults"
        description="Applied to every new estimate created without a template."
        settings={settings}
        onChange={(next) => {
          updateOrgSettings({ customizations: { defaultDisplaySettings: next } }).catch(() =>
            toast.error("Failed to save")
          );
        }}
      />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EstimateSettingsPage() {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Estimate Settings</h1>
        <p className="text-sm text-slate-500">
          Manage estimate templates and default configurations
        </p>
      </div>

      <Tabs defaultValue="document-templates">
        <TabsList className="mb-4">
          <TabsTrigger value="document-templates">Document Templates</TabsTrigger>
          <TabsTrigger value="email-templates">Email Templates</TabsTrigger>
          <TabsTrigger value="client-view">Client View</TabsTrigger>
        </TabsList>

        <TabsContent value="document-templates">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-slate-700">Templates</h2>
            <p className="text-xs text-slate-400">
              Pre-built line item sets you can apply when creating estimates
            </p>
          </div>
          <EstimateTemplatesList />
        </TabsContent>

        <TabsContent value="email-templates">
          <EmailTemplatesEditor
            templateType="estimate"
            description="Email templates sent when sharing or following up on estimates."
            mergeTags={EMAIL_MERGE_TAGS}
            emptyMessage="No email templates yet. Create one to use when sending estimates."
          />
        </TabsContent>

        <TabsContent value="client-view">
          <ClientViewDefaultsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
