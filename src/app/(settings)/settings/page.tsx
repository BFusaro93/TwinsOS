"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersPage } from "@/components/settings/UsersPage";
import { OrganizationTab } from "@/components/settings/OrganizationTab";
import { BrandingTab } from "@/components/settings/BrandingTab";
import { SubscriptionTab } from "@/components/settings/SubscriptionTab";
import { ZapierIntegrationCard } from "@/components/settings/ZapierIntegrationCard";
import { ApiKeysCard } from "@/components/settings/ApiKeysCard";
import { HomeShortcutsCard } from "@/components/settings/HomeShortcutsCard";
import { AccessDenied } from "@/components/shared/AccessDenied";
import { useCurrentUserStore } from "@/stores";

const TAB_KEYS = ["organization", "branding", "users", "subscription", "integrations"] as const;
type TabKey = (typeof TAB_KEYS)[number];

function tabLabel(tab: TabKey): string {
  switch (tab) {
    case "users":         return "Users";
    case "organization":  return "Organization";
    case "branding":      return "Branding";
    case "subscription":  return "Subscription";
    case "integrations":  return "Integrations";
  }
}

function MasterAccountSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const defaultTab = TAB_KEYS.includes(requestedTab as TabKey) ? (requestedTab as TabKey) : "organization";

  return (
    <div className="flex flex-col gap-0">
      <div className="px-4 pt-4 pb-0 md:px-6 md:pt-6">
        <h1 className="text-xl font-semibold text-slate-900">Master Account Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Users, organization info, branding, and subscriptions for your whole account
        </p>
      </div>
      <Tabs
        defaultValue={defaultTab}
        className="mt-4"
        onValueChange={(tab) => router.replace(`/settings?tab=${tab}`, { scroll: false })}
      >
        <div className="border-b px-4 md:px-6">
          <TabsList className="h-auto flex-wrap gap-0 rounded-none bg-transparent p-0">
            {TAB_KEYS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-slate-600 md:px-4 md:py-3 md:text-sm data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
              >
                {tabLabel(tab)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="p-4 md:p-6">
          <TabsContent value="users" className="mt-0">
            <UsersPage />
          </TabsContent>

          <TabsContent value="organization" className="mt-0">
            <OrganizationTab />
          </TabsContent>

          <TabsContent value="branding" className="mt-0">
            <BrandingTab />
          </TabsContent>

          <TabsContent value="subscription" className="mt-0">
            <SubscriptionTab />
          </TabsContent>

          <TabsContent value="integrations" className="mt-0">
            <div className="flex max-w-2xl flex-col gap-6">
              <ZapierIntegrationCard />
              <ApiKeysCard />
              <HomeShortcutsCard />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default function MasterAccountSettingsPage() {
  const { currentUser, currentUserLoaded } = useCurrentUserStore();

  // Master Account Settings covers org info, branding, user management,
  // subscription/billing, and the Zapier integration key — all account-wide,
  // sensitive, and not something every role should see or change. Unlike
  // Landscapt Settings (gated by the crm_settings permission — see
  // LandscaptSettingsTabs), there's no finer-grained permission to check
  // here, so this is admin-only.
  if (currentUserLoaded && currentUser.role !== "admin") {
    return (
      <AccessDenied
        title="Admins only"
        message="Master Account Settings — organization info, users, branding, billing, and integrations — is only available to admins. Ask an admin if you need something changed here."
      />
    );
  }

  return (
    <Suspense>
      <MasterAccountSettings />
    </Suspense>
  );
}
