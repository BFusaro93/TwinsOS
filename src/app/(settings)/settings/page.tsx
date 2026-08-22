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
            <div className="max-w-2xl">
              <ZapierIntegrationCard />
              <ApiKeysCard />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default function MasterAccountSettingsPage() {
  return (
    <Suspense>
      <MasterAccountSettings />
    </Suspense>
  );
}
