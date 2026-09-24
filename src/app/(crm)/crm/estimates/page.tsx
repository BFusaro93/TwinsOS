import { Suspense } from "react";
import { EstimatesList } from "@/components/crm/estimates/EstimatesList";

export default function EstimatesPage() {
  return (
    <div className="flex h-full flex-col">
      {/* EstimatesList reads ?stage= (dashboard deep-links) via useSearchParams. */}
      <Suspense>
        <EstimatesList />
      </Suspense>
    </div>
  );
}
