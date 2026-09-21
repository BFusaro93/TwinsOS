"use client";

import { toast } from "sonner";
import Link from "next/link";
import { EstimateTemplatesList } from "@/components/crm/estimates/EstimateTemplatesList";
import { EstimateDisplaySettingsPanel } from "@/components/crm/estimates/EstimateDisplaySettingsPanel";
import { Button } from "@/components/ui/button";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { getOrgDefaultDisplaySettings } from "@/lib/estimate-display-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        Default display settings for brand-new estimates that don&apos;t use a service bundle. A bundle&apos;s
        own Client View settings always take priority over these when one is selected.
      </p>
      <EstimateDisplaySettingsPanel
        title="Company-wide client view defaults"
        description="Applied to every new estimate created without a service bundle."
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
          Manage service bundles and default configurations
        </p>
      </div>

      <Tabs defaultValue="service-bundles">
        <TabsList className="mb-4">
          <TabsTrigger value="service-bundles">Service Bundles</TabsTrigger>
          <TabsTrigger value="email-templates">Email Templates</TabsTrigger>
          <TabsTrigger value="client-view">Client View</TabsTrigger>
        </TabsList>

        <TabsContent value="service-bundles">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-slate-700">Service Bundles</h2>
            <p className="text-xs text-slate-400">
              Pre-built line item sets you can apply when creating estimates
            </p>
          </div>
          <EstimateTemplatesList />
        </TabsContent>

        <TabsContent value="email-templates">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-slate-700">Email Templates</h2>
            <p className="text-xs text-slate-400">
              Email templates used when sending an estimate now live in Documents, alongside every other
              template type.
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-slate-200 p-4">
            <p className="text-sm text-slate-600">
              Build and edit estimate email templates in <span className="font-medium">Documents</span> — create a
              document with type &quot;Estimate&quot;, and it&apos;ll show up in the template picker when
              sending an estimate.
            </p>
            <Link href="/crm/settings/documents" className="w-fit">
              <Button size="sm" variant="outline" className="h-8 text-xs">
                Go to Documents
              </Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="client-view">
          <ClientViewDefaultsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
