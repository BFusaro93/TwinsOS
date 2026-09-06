import { Suspense } from "react";
import { DispatchBoard } from "@/components/crm/DispatchBoard";

export default function DispatchPage() {
  return (
    <div className="flex h-full flex-col">
      {/* DispatchBoard reads ?date= via useSearchParams, which Next requires
          to sit under a Suspense boundary. */}
      <Suspense fallback={null}>
        <DispatchBoard />
      </Suspense>
    </div>
  );
}
