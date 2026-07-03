import { Suspense } from "react";
import { RequestListPage } from "@/components/cmms/RequestListPage";

export default function RequestsPage() {
  return (
    <Suspense>
      <RequestListPage />
    </Suspense>
  );
}
