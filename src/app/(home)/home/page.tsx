"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, Wrench, NotepadText, Leaf, Truck, Users, ExternalLink, Settings, Camera, Sprout } from "lucide-react";
import { useCurrentUserStore } from "@/stores";
import { useSettingsStore } from "@/stores/settings-store";
import { createClient } from "@/lib/supabase/client";
import { isBillablePlan } from "@/lib/stripe/plans";
import { useModuleAccess, useAddonAccess } from "@/lib/hooks/use-module-access";

/**
 * Picked a paid plan at signup instead of "start free trial"? Checkout can't
 * run until email confirmation gives us an authenticated session, so
 * organizations.pending_plan records the choice and this is the first
 * authenticated page they land on — send them straight into checkout for it.
 */
function usePendingPlanRedirect() {
  const router = useRouter();
  const { data: pendingPlan } = useQuery({
    queryKey: ["org-pending-plan"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return null;
      const { data: org } = await supabase
        .from("organizations")
        .select("pending_plan")
        .eq("id", profile.org_id)
        .single();
      return org?.pending_plan ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (pendingPlan && isBillablePlan(pendingPlan)) {
      router.replace(`/settings?tab=subscription&autoSubscribe=${pendingPlan}`);
    }
  }, [pendingPlan, router]);
}

const INTERNAL_BOX =
  "group flex flex-col items-center gap-5 rounded-2xl border-2 border-slate-200 bg-white p-10 shadow-sm transition-all duration-150 hover:border-brand-400 hover:shadow-lg";

const CREW_BOX =
  "group flex flex-col items-center gap-5 rounded-2xl border-2 border-slate-200 bg-white p-10 shadow-sm transition-all duration-150 hover:border-brand-400 hover:shadow-lg";

const EXTERNAL_BOX =
  "group flex flex-col items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-8 shadow-sm transition-all duration-150 hover:border-slate-400 hover:shadow-lg";

function CrewHome() {
  const { logoDataUrl, orgName } = useSettingsStore();
  const { allowed: hasJobPhotos } = useAddonAccess("job_photos");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      <div className="mb-10 flex flex-col items-center gap-3">
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt={orgName}
            className="h-14 w-14 rounded-2xl object-contain shadow-md"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-md">
            <Leaf className="h-7 w-7 text-white" />
          </div>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Landscapt</h1>
        <p className="text-sm text-slate-500">What would you like to do?</p>
      </div>

      {/* Primary tiles */}
      <div className="grid w-full max-w-lg grid-cols-1 gap-5 sm:grid-cols-2">
        <Link href="/dashboards/kpis" className={CREW_BOX}>
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
            <BarChart2 className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">Dashboards</p>
            <p className="mt-1 text-sm text-slate-500">Reports &amp; analytics</p>
          </div>
        </Link>

        {hasJobPhotos && (
          <Link href="/photos/jobs" className={CREW_BOX}>
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
              <Camera className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900">Job Photos</p>
              <p className="mt-1 text-sm text-slate-500">Field photo documentation &amp; field forms</p>
            </div>
          </Link>
        )}
      </div>

    </div>
  );
}

export default function HomePage() {
  const { currentUser } = useCurrentUserStore();
  const { logoDataUrl, orgName } = useSettingsStore();
  const { allowed: hasEquipt } = useModuleAccess("equipt");
  const { allowed: hasLandscapt } = useModuleAccess("landscapt");
  const { allowed: hasJobPhotos } = useAddonAccess("job_photos");
  usePendingPlanRedirect();

  if (currentUser.role === "crew") {
    return <CrewHome />;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      {/* Logo / header */}
      <div className="mb-12 flex flex-col items-center gap-3">
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt={orgName}
            className="h-14 w-14 rounded-2xl object-contain shadow-md"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-md">
            <Leaf className="h-7 w-7 text-white" />
          </div>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Landscapt</h1>
        <p className="text-sm text-slate-500">Make a section to get started</p>
      </div>

      {/* Primary app boxes */}
      <div className="grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <Link href="/dashboards/kpis" className={INTERNAL_BOX}>
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
            <BarChart2 className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">Dashboards</p>
            <p className="mt-1 text-sm text-slate-500">Custom reports &amp; analytics</p>
          </div>
        </Link>

        {hasEquipt && (
          <Link href="/dashboard" className={INTERNAL_BOX}>
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
              <Wrench className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900">Equipt</p>
              <p className="mt-1 text-sm text-slate-500">Work orders, purchasing &amp; asset management</p>
            </div>
          </Link>
        )}

        {hasLandscapt && (
          <Link href="/crm/home" className={INTERNAL_BOX}>
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
              <Sprout className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900">Landscapt</p>
              <p className="mt-1 text-sm text-slate-500">Clients, estimates, scheduling &amp; invoicing</p>
            </div>
          </Link>
        )}

        {hasLandscapt && (
          <Link href="/tools/calculators" className={INTERNAL_BOX}>
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
              <NotepadText className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900">Tools</p>
              <p className="mt-1 text-sm text-slate-500">Job costing, damage cases &amp; calculators</p>
            </div>
          </Link>
        )}

        {hasJobPhotos && (
          <Link href="/photos/jobs" className={INTERNAL_BOX}>
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
              <Camera className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900">Job Photos</p>
              <p className="mt-1 text-sm text-slate-500">Field photo documentation &amp; field forms</p>
            </div>
          </Link>
        )}
      </div>

      {/* External app shortcuts */}
      <div className="mt-5 grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
        <Link href="/settings" className={EXTERNAL_BOX}>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-200">
            <Settings className="h-6 w-6" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-slate-700">Settings</p>
            <p className="mt-0.5 text-xs text-slate-400">Org, branding &amp; subscriptions</p>
          </div>
        </Link>

        <a
          href="https://launcher.myapps.microsoft.com/api/signin/f92a2fea-344f-41bc-9293-72562ec4ee57?tenantId=c32bfd53-52c9-4186-989f-1985ff7eb8ae"
          target="_blank"
          rel="noopener noreferrer"
          className={EXTERNAL_BOX}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-200">
            <Truck className="h-6 w-6" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-base font-semibold text-slate-700">Samsara</p>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Fleet &amp; driver safety</p>
          </div>
        </a>

        <a
          href="https://app.gusto.com/login"
          target="_blank"
          rel="noopener noreferrer"
          className={EXTERNAL_BOX}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-200">
            <Users className="h-6 w-6" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-base font-semibold text-slate-700">Gusto</p>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Payroll &amp; HR</p>
          </div>
        </a>
      </div>
    </div>
  );
}
