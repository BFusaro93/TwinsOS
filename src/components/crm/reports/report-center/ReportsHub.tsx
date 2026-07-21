"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { CRMReports } from "@/components/crm/reports/CRMReports";
import { ReportCatalog } from "./ReportCatalog";
import { MyReportsList } from "./MyReportsList";
import { DashboardsList } from "./DashboardsList";

const TAB_KEYS = ["dashboard", "dashboards", "center", "custom"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export function ReportsHub() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("tab") ?? "dashboard";
  const active: TabKey = (TAB_KEYS as readonly string[]).includes(raw)
    ? (raw as TabKey)
    : "dashboard";

  const setTab = useCallback(
    (tab: string) => {
      router.replace(`${pathname}?tab=${tab}`, { scroll: false });
    },
    [router, pathname]
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Reports"
        description="Dashboards, the report catalog, and your saved custom analyses."
      />
      <Tabs value={active} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="h-10 w-fit justify-start gap-1 rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="dashboard"
            className="rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Dashboard
          </TabsTrigger>
          <TabsTrigger
            value="dashboards"
            className="rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Dashboards
          </TabsTrigger>
          <TabsTrigger
            value="center"
            className="rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Report Center
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            className="rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            My Reports
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4 flex-1 overflow-auto">
          <CRMReports hideHeader />
        </TabsContent>
        <TabsContent value="dashboards" className="mt-4 flex-1 overflow-auto">
          <DashboardsList />
        </TabsContent>
        <TabsContent value="center" className="mt-4 flex-1 overflow-auto">
          <ReportCatalog />
        </TabsContent>
        <TabsContent value="custom" className="mt-4 flex-1 overflow-auto">
          <MyReportsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
