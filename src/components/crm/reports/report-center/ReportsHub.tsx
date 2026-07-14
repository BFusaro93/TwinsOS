"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { CRMReports } from "@/components/crm/reports/CRMReports";
import { ReportCatalog } from "./ReportCatalog";
import { MyReportsList } from "./MyReportsList";

const TAB_KEYS = ["dashboard", "center", "custom"] as const;
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
    <div className="flex h-full flex-col overflow-auto">
      <PageHeader
        title="Reports"
        description="Dashboards, the report catalog, and your saved custom analyses."
      />
      <Tabs value={active} onValueChange={setTab} className="flex-1">
        <div className="border-b bg-white px-6">
          <TabsList className="h-10 bg-transparent p-0">
            <TabsTrigger
              value="dashboard"
              className="rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Dashboard
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
        </div>
        <TabsContent value="dashboard" className="mt-0">
          <CRMReports hideHeader />
        </TabsContent>
        <TabsContent value="center" className="mt-0 p-6">
          <ReportCatalog />
        </TabsContent>
        <TabsContent value="custom" className="mt-0 p-6">
          <MyReportsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
