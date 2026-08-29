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
import { OAuthConnectionsCard } from "@/components/settings/OAuthConnectionsCard";
import { OAuthWriteRolesCard } from "@/components/settings/OAuthWriteRolesCard";
import { HomeShortcutsCard } from "@/components/settings/HomeShortcutsCard";
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
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-6">
                <ZapierIntegrationCard />
                <ApiKeysCard />
                <OAuthConnectionsCard />
                <OAuthWriteRolesCard />
              </div>
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
  // here, so this is admin-only — EXCEPT the OAuth "Connected Apps" card,
  // which isn't an org-wide setting: an OAuth grant belongs to whichever
  // user approved it (the API route it's backed by already scopes non-admins
  // to their own connections only), so every org member gets a stripped-down
  // view of just that, rather than being blocked from ever disconnecting an
  // app they connected themselves.
  if (currentUserLoaded && currentUser.role !== "admin") {
    return <NonAdminConnectedApps />;
  }

  return (
    <Suspense>
      <MasterAccountSettings />
    </Suspense>
  );
}

function NonAdminConnectedApps() {
  return (
    <div className="flex flex-col gap-0">
      <div className="px-4 pt-4 pb-0 md:px-6 md:pt-6">
        <h1 className="text-xl font-semibold text-slate-900">Connected Apps</h1>
        <p className="mt-1 text-sm text-slate-500">
          Apps you&apos;ve signed in and granted access to. The rest of Master Account Settings —
          organization info, users, branding, billing — is only available to admins.
        </p>
      </div>
      <div className="p-4 md:p-6 md:max-w-lg">
        <OAuthConnectionsCard />
      </div>
    </div>
  );
}
