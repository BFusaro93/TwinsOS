"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  Wrench,
  CalendarCheck,
  BarChart2,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  FileText,
  Target,
  Gauge,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCurrentUserStore } from "@/stores";
import { useModuleAccess } from "@/lib/hooks/use-module-access";
import { useIsInternalOrg } from "@/lib/hooks/use-internal-org";
import { useDashboards } from "@/lib/hooks/use-report-center";

const CARD =
  "group flex items-start gap-4 rounded-xl border bg-white p-5 shadow-sm transition-all hover:border-brand-400 hover:shadow-md";

function DashboardCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className={CARD}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
    </Link>
  );
}

export default function DashboardsHomePage() {
  const { currentUser } = useCurrentUserStore();
  // Crew logins only get custom dashboards an admin flagged "Show to crew"
  // (the /api/crm/dashboards list is already filtered server-side for them);
  // the built-in Equipt / My Day / Reports dashboards are office tools.
  const isCrew = currentUser.role === "crew";
  const { allowed: hasEquipt } = useModuleAccess("equipt");
  const { allowed: hasLandscapt } = useModuleAccess("landscapt");
  const { isInternalOrg } = useIsInternalOrg();
  const { data: customDashboards = [] } = useDashboards();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboards" description="Every dashboard available to you, in one place." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hasEquipt && !isCrew && (
          <DashboardCard
            href="/dashboards/equipt"
            icon={Wrench}
            title="Equipt Dashboard"
            description="Work orders, purchasing & asset management"
          />
        )}

        {hasLandscapt && !isCrew && (
          <DashboardCard
            href="/dashboards/myday"
            icon={CalendarCheck}
            title="Landscapt My Day"
            description="Your daily schedule and tasks"
          />
        )}

        {hasLandscapt && !isCrew && (
          <DashboardCard
            href="/dashboards/landscapt-reports"
            icon={BarChart2}
            title="Reports Dashboard"
            description="Landscapt's built-in reporting dashboard"
          />
        )}

        {hasLandscapt && !isCrew && (
          <DashboardCard
            href="/dashboards/kpis"
            icon={Gauge}
            title="KPI Scorecard"
            description="Customizable KPIs computed live from Landscapt data"
          />
        )}

        {isInternalOrg && (
          <>
            <DashboardCard
              href="/dashboards/financials"
              icon={DollarSign}
              title="Financial"
              description="Revenue, expenses & margin"
            />
            <DashboardCard
              href="/dashboards/avb"
              icon={TrendingUp}
              title="Labor Efficiency"
              description="Budget vs. actual labor hours"
            />
            <DashboardCard
              href="/dashboards/safety"
              icon={ShieldCheck}
              title="Driver Safety Scores"
              description="Samsara driver safety scoring"
            />
            <DashboardCard
              href="/dashboards/crm"
              icon={FileText}
              title="CRM Report"
              description="Landscapt performance report"
            />
            <DashboardCard
              href="/dashboards/twins-kpis"
              icon={Target}
              title="Twins KPI Scorecard"
              description="Legacy scorecard (AvB, QBO, Samsara sources)"
            />
          </>
        )}

        {hasLandscapt &&
          customDashboards.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              href={`/dashboards/custom/${dashboard.id}`}
              icon={LayoutDashboard}
              title={dashboard.name}
              description={
                dashboard.description ||
                `${dashboard.config.tabs.length} ${dashboard.config.tabs.length === 1 ? "tab" : "tabs"}`
              }
            />
          ))}
      </div>
    </div>
  );
}
