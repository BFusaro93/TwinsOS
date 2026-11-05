"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { CommissionEarningsTab } from "./CommissionEarningsTab";
import { useMyCommissionEmployeeId } from "@/lib/hooks/use-commissions";
import { CommissionStatementsTab } from "./CommissionStatementsTab";

const TAB_CLASS =
  "h-full shrink-0 rounded-none border-b-2 border-transparent px-4 py-0 text-sm data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none";

export function CommissionsPage() {
  const { can, isLoading } = usePermissions();
  const canManage = can("commission_manage");
  const canViewAll = canManage || can("commission_view");
  const canViewOwn = can("commission_view_own");
  const { data: myEmployeeId, isLoading: meLoading } = useMyCommissionEmployeeId();

  if (isLoading) return null;
  if (!canViewAll && !canViewOwn) {
    return <p className="p-6 text-sm text-muted-foreground">You don&apos;t have access to commissions.</p>;
  }

  // A rep with only "view my own" is pinned to their own earnings and statements.
  const ownOnly = !canViewAll;
  if (ownOnly && !meLoading && !myEmployeeId) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Your login isn&apos;t linked to an employee record yet, so there are no commissions to show. Ask an admin to link it on your employee profile.
      </p>
    );
  }
  if (ownOnly && !myEmployeeId) return null;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{ownOnly ? "My Commissions" : "Commissions"}</h1>
          <p className="text-sm text-muted-foreground">
            {ownOnly
              ? "Your earnings from invoices and payments under your commission plan, and the statements issued to you."
              : "Earnings are calculated from invoices and payments using each rep\u2019s commission plan. Create a statement to lock a period for payout."}
          </p>
        </div>
        {canManage && (
          <Link href="/crm/settings?tab=commissions" className="text-sm text-brand-600 hover:underline">
            Manage plans &amp; assignments &rarr;
          </Link>
        )}
      </div>
      <Tabs defaultValue="earnings" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-10 justify-start gap-1 rounded-none border-b bg-transparent px-0 py-0">
          <TabsTrigger value="earnings" className={TAB_CLASS}>Earnings</TabsTrigger>
          <TabsTrigger value="statements" className={TAB_CLASS}>Statements</TabsTrigger>
        </TabsList>
        <TabsContent value="earnings" className="m-0 pt-4"><CommissionEarningsTab canManage={canManage} ownEmployeeId={ownOnly ? myEmployeeId ?? undefined : undefined} /></TabsContent>
        <TabsContent value="statements" className="m-0 pt-4"><CommissionStatementsTab canManage={canManage} /></TabsContent>
      </Tabs>
    </div>
  );
}
