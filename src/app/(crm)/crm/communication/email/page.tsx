"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { EmailActivityList } from "@/components/crm/email-activity/EmailActivityList";
import { SmsActivityList } from "@/components/crm/email-activity/SmsActivityList";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ActivityTab = "email" | "text";

export default function MessageActivityPage() {
  const [tab, setTab] = useState<ActivityTab>("email");
  const { can, isLoading: permissionsLoading } = usePermissions();
  if (!permissionsLoading && !can("email_activity_view")) {
    return (
      <EmptyState
        icon={Mail}
        title="No access"
        description="You don't have permission to view Message Activity."
      />
    );
  }


  return (
    <div className="flex h-full flex-col gap-2">
      <PageHeader
        title="Message Activity"
        description="All email and text communications sent to clients"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ActivityTab)}>
        <TabsList>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "email" ? <EmailActivityList /> : <SmsActivityList />}
    </div>
  );
}
