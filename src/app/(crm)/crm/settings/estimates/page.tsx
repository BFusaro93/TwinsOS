import { EstimateTemplatesList } from "@/components/crm/estimates/EstimateTemplatesList";

export default function EstimateSettingsPage() {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Estimate Settings</h1>
        <p className="text-sm text-slate-500">Manage estimate templates and default configurations</p>
      </div>

      <div className="mb-2">
        <h2 className="text-sm font-semibold text-slate-700">Templates</h2>
        <p className="text-xs text-slate-400">Pre-built line item sets you can apply when creating estimates</p>
      </div>
      <EstimateTemplatesList />
    </div>
  );
}
