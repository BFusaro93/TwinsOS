"use client";

import { ModuleAccessGuard } from "@/components/shared/ModuleAccessGuard";
import { MyDay } from "@/components/crm/MyDay";

export default function MyDayDashboardPage() {
  return (
    <ModuleAccessGuard module="landscapt">
      <MyDay />
    </ModuleAccessGuard>
  );
}
