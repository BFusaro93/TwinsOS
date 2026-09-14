"use client";

import { ModuleAccessGuard } from "@/components/shared/ModuleAccessGuard";
import { EquiptDashboard } from "@/components/operations/EquiptDashboard";

export default function EquiptDashboardPage() {
  return (
    <ModuleAccessGuard module="equipt">
      <EquiptDashboard />
    </ModuleAccessGuard>
  );
}
