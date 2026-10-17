import { Suspense } from "react";
import { CrewBoard } from "@/components/crm/dispatch/CrewBoard";

export default function CrewBoardPage() {
  return (
    <div className="flex h-full flex-col">
      {/* CrewBoard reads ?date= / ?tv= via useSearchParams, which Next requires
          to sit under a Suspense boundary. */}
      <Suspense fallback={null}>
        <CrewBoard />
      </Suspense>
    </div>
  );
}
