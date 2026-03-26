import { Suspense } from "react";
import { PartsPage } from "@/components/cmms/PartsPage";

export default function PartsInventoryPage() {
  return (
    <Suspense>
      <PartsPage />
    </Suspense>
  );
}
