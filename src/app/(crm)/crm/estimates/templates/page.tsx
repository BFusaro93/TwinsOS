import { EstimateTemplatesList } from "@/components/crm/estimates/EstimateTemplatesList";

export default function EstimateTemplatesPage() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">Estimate Templates</h1>
        <p className="text-sm text-slate-500">
          Reusable line item sets that pre-populate new estimates
        </p>
      </div>
      <EstimateTemplatesList />
    </div>
  );
}
