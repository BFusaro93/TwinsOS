import { Suspense } from "react";
import { StatementsList } from "@/components/crm/accounting/StatementsList";

export default function StatementsPage() {
  return (
    <div className="flex h-full flex-col">
      <Suspense>
        <StatementsList />
      </Suspense>
    </div>
  );
}
