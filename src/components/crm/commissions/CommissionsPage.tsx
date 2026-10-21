"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { CommissionEarningsTab } from "./CommissionEarningsTab";
import { CommissionPlansTab } from "./CommissionPlansTab";
import { CommissionStatementsTab } from "./CommissionStatementsTab";

const TAB_CLASS =
  "h-full shrink-0 rounded-none border-b-2 border-transparent px-4 py-0 text-sm data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none";

export function CommissionsPage() {
  const { can, isLoading } = usePermissions();
  const canManage = can("commission_manage");

  if (!isLoading && !can("commission_view") && !canManage) {
    return <p className="p-6 text-sm text-muted-foreground">You don&apos;t have access to commissions.</p>;
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Commissions</h1>
        <p className="text-sm text-muted-foreground">
          Earnings are calculated from invoices and payments using each rep&apos;s commission plan. Create a statement to
          lock a period for payout.
        </p>
      </div>
      <Tabs defaultValue="earnings" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-10 justify-start gap-1 rounded-none border-b bg-transparent px-0 py-0">
          <TabsTrigger value="earnings" className={TAB_CLASS}>Earnings</TabsTrigger>
          <TabsTrigger value="statements" className={TAB_CLASS}>Statements</TabsTrigger>
          {canManage && <TabsTrigger value="plans" className={TAB_CLASS}>Plans &amp; Assignments</TabsTrigger>}
        </TabsList>
        <TabsContent value="earnings" className="m-0 pt-4"><CommissionEarningsTab canManage={canManage} /></TabsContent>
        <TabsContent value="statements" className="m-0 pt-4"><CommissionStatementsTab canManage={canManage} /></TabsContent>
        {canManage && <TabsContent value="plans" className="m-0 pt-4"><CommissionPlansTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
