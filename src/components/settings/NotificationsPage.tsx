"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useCurrentUserStore } from "@/stores";
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "@/lib/hooks/use-notification-prefs";
import { useUsers } from "@/lib/hooks/use-users";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { useModuleAccess } from "@/lib/hooks/use-module-access";

// ---------------------------------------------------------------------------
// RecipientsPicker — org-level (admin-only) config for WHICH staff are even
// eligible to receive a given broadcast-style notification. Separate from
// the personal opt-out toggles below: this restricts the candidate audience
// itself (default is every admin/manager), those toggles let each person on
// that list still turn it off for themselves. Stored in
// organizations.customizations[customizationsKey] — absent/null means "all
// admins/managers" (the original, un-configurable behavior); an explicit
// array (even empty) means "exactly these people".
// ---------------------------------------------------------------------------

function RecipientsPicker({
  customizationsKey,
  title,
  description,
}: {
  customizationsKey: string;
  title: string;
  description: string;
}) {
  const { data: users = [] } = useUsers();
  const { data: orgSettings } = useOrgSettings();
  const { mutate: updateOrgSettings } = useUpdateOrgSettings();

  const staff = users.filter((u) => u.role === "admin" || u.role === "manager");
  const configured = orgSettings?.customizations?.[customizationsKey] as string[] | null | undefined;
  const usingDefault = !Array.isArray(configured);
  const selectedIds = new Set(usingDefault ? staff.map((u) => u.id) : configured);

  function setUsingDefault(useDefault: boolean) {
    updateOrgSettings({ customizations: { [customizationsKey]: useDefault ? null : staff.map((u) => u.id) } });
  }

  function toggleUser(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    updateOrgSettings({ customizations: { [customizationsKey]: Array.from(next) } });
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <div className="px-5 py-4">
        <label className="mb-3 flex items-center gap-2 text-sm">
          <Checkbox checked={usingDefault} onCheckedChange={(v) => setUsingDefault(!!v)} />
          All admins &amp; managers (default)
        </label>
        {!usingDefault && (
          <div className="ml-6 flex flex-col gap-2 border-l pl-4">
            {staff.length === 0 && (
              <p className="text-xs text-slate-400">No admins or managers found.</p>
            )}
            {staff.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox checked={selectedIds.has(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                {u.name} <span className="text-xs text-slate-400">({u.role})</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingRow
// ---------------------------------------------------------------------------

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-8 py-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationsPage
// ---------------------------------------------------------------------------

interface NotificationsPageProps {
  hideHeader?: boolean;
  /** "cmms" (default) shows Equipt/CMMS + Purchasing prefs, used on the main
   *  Settings page. "crm" shows only Landscapt/Estimates prefs, used on the
   *  CRM Settings page's Notifications tab. Mutually exclusive on purpose —
   *  estimate prefs used to live commingled with CMMS ones on the main
   *  Settings page, which is exactly what this split fixes. */
  scope?: "cmms" | "crm";
}

export function NotificationsPage({ hideHeader = false, scope = "cmms" }: NotificationsPageProps) {
  const { currentUser } = useCurrentUserStore();
  const isAdmin = currentUser.role === "admin";
  // Requisition/PO prefs in the "cmms" scope are shared with Landscapt-only
  // orgs, but Work Order / low-stock-part / PM-schedule / maintenance-request
  // prefs are genuinely CMMS-only — hide those rows rather than the whole
  // scope, since dropping the whole thing would also hide the Requisition/PO
  // toggles a landscapt-only org still needs.
  const { allowed: hasEquipt } = useModuleAccess("equipt");
  const { data: remotePrefs, isLoading } = useNotificationPrefs();
  const { mutate: updatePrefs } = useUpdateNotificationPrefs();

  // Local draft — seeded from DB on first load
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [saved, setSaved] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (!remotePrefs || seeded.current) return;
    seeded.current = true;
    setPrefs(remotePrefs);
  }, [remotePrefs]);

  // Auto-save 600 ms after any change
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function toggle(key: keyof NotificationPrefs) {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updatePrefs({ [key]: next[key] }, {
          onSuccess: () => {
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          },
        });
      }, 600);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {!hideHeader && (
        <PageHeader
          title="Notifications"
          description={scope === "crm" ? "Configure your estimate notification preferences" : "Configure your notification preferences"}
          action={
            saved ? (
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            ) : undefined
          }
        />
      )}

      {scope === "crm" && isAdmin && (
        <>
          <RecipientsPicker
            customizationsKey="estimateDecisionRecipientIds"
            title="Estimate Decision Recipients"
            description="Choose who is even eligible to be notified when a client accepts or declines an estimate. The estimate's sales rep is always included in addition to whoever's picked here."
          />
          <RecipientsPicker
            customizationsKey="newTicketRecipientIds"
            title="New Ticket Recipients"
            description="Choose who is even eligible to be notified when a new ticket comes in. The ticket's assignee (if any) is always included in addition to whoever's picked here."
          />
        </>
      )}

      {/* Email Notifications */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Email Notifications
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Configure which events trigger an email to your inbox
          </p>
          <p className="mt-2 text-xs text-slate-400">
            You won&apos;t get an email for actions you performed yourself (e.g. assigning a work order to yourself) — only for changes made by someone else.
          </p>
        </div>
        <div className="divide-y px-5">
          {scope === "cmms" && (
            <>
              {hasEquipt && (
                <>
                  <SettingRow label="Work Order Assigned" description="When a work order is assigned to you">
                    <Switch checked={prefs.emailWorkOrderAssigned} onCheckedChange={() => toggle("emailWorkOrderAssigned")} />
                  </SettingRow>
                  <SettingRow label="Work Order Status Changed" description="When the status of your work order changes">
                    <Switch checked={prefs.emailWorkOrderStatusChanged} onCheckedChange={() => toggle("emailWorkOrderStatusChanged")} />
                  </SettingRow>
                  <SettingRow label="Work Order Overdue" description="When a work order passes its due date">
                    <Switch checked={prefs.emailWorkOrderOverdue} onCheckedChange={() => toggle("emailWorkOrderOverdue")} />
                  </SettingRow>
                  <SettingRow label="Work Order Comment" description="When someone comments on a work order you're assigned to">
                    <Switch checked={prefs.emailWorkOrderComment} onCheckedChange={() => toggle("emailWorkOrderComment")} />
                  </SettingRow>
                </>
              )}
              <SettingRow label="Requisition Approved" description="When your purchase requisition is approved">
                <Switch checked={prefs.emailRequisitionApproved} onCheckedChange={() => toggle("emailRequisitionApproved")} />
              </SettingRow>
              <SettingRow label="Requisition Rejected" description="When your purchase requisition is rejected">
                <Switch checked={prefs.emailRequisitionRejected} onCheckedChange={() => toggle("emailRequisitionRejected")} />
              </SettingRow>
              <SettingRow label="Approval Required" description="When any record requires your approval">
                <Switch checked={prefs.emailApprovalRequired} onCheckedChange={() => toggle("emailApprovalRequired")} />
              </SettingRow>
              <SettingRow label="PO Approval Required" description="When a purchase order requires your approval">
                <Switch checked={prefs.emailPoApprovalRequired} onCheckedChange={() => toggle("emailPoApprovalRequired")} />
              </SettingRow>
              {hasEquipt && (
                <>
                  <SettingRow label="Low Stock Alert" description="When a part drops below its minimum stock level">
                    <Switch checked={prefs.emailLowStockAlert} onCheckedChange={() => toggle("emailLowStockAlert")} />
                  </SettingRow>
                  <SettingRow label="PM Schedule Due" description="When a preventive maintenance schedule is due within 7 days">
                    <Switch checked={prefs.emailPmScheduleDue} onCheckedChange={() => toggle("emailPmScheduleDue")} />
                  </SettingRow>
                  <SettingRow label="New Maintenance Request" description="When a new maintenance request is submitted">
                    <Switch checked={prefs.emailNewMaintenanceRequest} onCheckedChange={() => toggle("emailNewMaintenanceRequest")} />
                  </SettingRow>
                  {isAdmin && (
                    <>
                      <div className="pb-1 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Admin — All Work Orders</p>
                      </div>
                      <SettingRow label="Any WO Created" description="When any work order is created in the org">
                        <Switch checked={prefs.emailAdminWoCreated} onCheckedChange={() => toggle("emailAdminWoCreated")} />
                      </SettingRow>
                      <SettingRow label="Any WO Status Changed" description="When any work order's status changes">
                        <Switch checked={prefs.emailAdminWoStatusChanged} onCheckedChange={() => toggle("emailAdminWoStatusChanged")} />
                      </SettingRow>
                      <SettingRow label="Any WO Comment Added" description="When anyone comments on any work order">
                        <Switch checked={prefs.emailAdminWoComment} onCheckedChange={() => toggle("emailAdminWoComment")} />
                      </SettingRow>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {scope === "crm" && (
            <>
              <SettingRow label="Estimate Approved" description="When your estimate is approved">
                <Switch checked={prefs.emailEstimateApproved} onCheckedChange={() => toggle("emailEstimateApproved")} />
              </SettingRow>
              <SettingRow label="Estimate Rejected" description="When your estimate is rejected">
                <Switch checked={prefs.emailEstimateRejected} onCheckedChange={() => toggle("emailEstimateRejected")} />
              </SettingRow>
              <SettingRow label="Estimate Approval Required" description="When an estimate requires your approval">
                <Switch checked={prefs.emailEstimateApprovalRequired} onCheckedChange={() => toggle("emailEstimateApprovalRequired")} />
              </SettingRow>
              <SettingRow label="Estimate Accepted by Client" description="When a client accepts your estimate via the proposal link or client portal">
                <Switch checked={prefs.emailEstimateClientAccepted} onCheckedChange={() => toggle("emailEstimateClientAccepted")} />
              </SettingRow>
              <SettingRow label="Estimate Declined by Client" description="When a client declines your estimate via the proposal link or client portal">
                <Switch checked={prefs.emailEstimateClientRejected} onCheckedChange={() => toggle("emailEstimateClientRejected")} />
              </SettingRow>
              <SettingRow label="Estimate Expiring Soon" description="When an estimate you created is expiring within 3 days and hasn't been accepted">
                <Switch checked={prefs.emailEstimateExpiring} onCheckedChange={() => toggle("emailEstimateExpiring")} />
              </SettingRow>
              <div className="pb-1 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tickets</p>
              </div>
              <SettingRow label="New Ticket" description="When a new ticket is created">
                <Switch checked={prefs.emailNewTicket} onCheckedChange={() => toggle("emailNewTicket")} />
              </SettingRow>
              <SettingRow label="Ticket Assigned" description="When a ticket is assigned to you">
                <Switch checked={prefs.emailTicketAssigned} onCheckedChange={() => toggle("emailTicketAssigned")} />
              </SettingRow>
              <SettingRow label="Ticket Comment" description="When someone comments on a ticket assigned to you">
                <Switch checked={prefs.emailTicketComment} onCheckedChange={() => toggle("emailTicketComment")} />
              </SettingRow>
              <div className="pb-1 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contracts</p>
              </div>
              <SettingRow label="Contract Expiring Soon" description="When a contract you own is ending within 3 days and isn't set to auto-renew">
                <Switch checked={prefs.emailContractExpiring} onCheckedChange={() => toggle("emailContractExpiring")} />
              </SettingRow>
            </>
          )}
        </div>
      </div>

      {/* In-App Notifications */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            In-App Notifications
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Configure which events show a notification badge in the app
          </p>
        </div>
        <div className="divide-y px-5">
          {scope === "cmms" && (
            <>
              {hasEquipt && (
                <>
                  <SettingRow label="Work Order Assigned" description="When a work order is assigned to you">
                    <Switch checked={prefs.inAppWorkOrderAssigned} onCheckedChange={() => toggle("inAppWorkOrderAssigned")} />
                  </SettingRow>
                  <SettingRow label="Work Order Status Changed" description="When the status of your work order changes">
                    <Switch checked={prefs.inAppWorkOrderStatusChanged} onCheckedChange={() => toggle("inAppWorkOrderStatusChanged")} />
                  </SettingRow>
                  <SettingRow label="Work Order Overdue" description="When a work order passes its due date">
                    <Switch checked={prefs.inAppWorkOrderOverdue} onCheckedChange={() => toggle("inAppWorkOrderOverdue")} />
                  </SettingRow>
                  <SettingRow label="Work Order Comment" description="When someone comments on a work order you're assigned to">
                    <Switch checked={prefs.inAppWorkOrderComment} onCheckedChange={() => toggle("inAppWorkOrderComment")} />
                  </SettingRow>
                </>
              )}
              <SettingRow label="Requisition Approved" description="When your purchase requisition is approved">
                <Switch checked={prefs.inAppRequisitionApproved} onCheckedChange={() => toggle("inAppRequisitionApproved")} />
              </SettingRow>
              <SettingRow label="Requisition Rejected" description="When your purchase requisition is rejected">
                <Switch checked={prefs.inAppRequisitionRejected} onCheckedChange={() => toggle("inAppRequisitionRejected")} />
              </SettingRow>
              <SettingRow label="Approval Required" description="When any record requires your approval">
                <Switch checked={prefs.inAppApprovalRequired} onCheckedChange={() => toggle("inAppApprovalRequired")} />
              </SettingRow>
              <SettingRow label="PO Approval Required" description="When a purchase order requires your approval">
                <Switch checked={prefs.inAppPoApprovalRequired} onCheckedChange={() => toggle("inAppPoApprovalRequired")} />
              </SettingRow>
              {hasEquipt && (
                <>
                  <SettingRow label="Low Stock Alert" description="When a part drops below its minimum stock level">
                    <Switch checked={prefs.inAppLowStockAlert} onCheckedChange={() => toggle("inAppLowStockAlert")} />
                  </SettingRow>
                  <SettingRow label="PM Schedule Due" description="When a preventive maintenance schedule is due within 7 days">
                    <Switch checked={prefs.inAppPmScheduleDue} onCheckedChange={() => toggle("inAppPmScheduleDue")} />
                  </SettingRow>
                  <SettingRow label="New Maintenance Request" description="When a new maintenance request is submitted">
                    <Switch checked={prefs.inAppNewMaintenanceRequest} onCheckedChange={() => toggle("inAppNewMaintenanceRequest")} />
                  </SettingRow>
                </>
              )}
            </>
          )}
          {scope === "crm" && (
            <>
              <SettingRow label="Estimate Approval Required" description="When an estimate requires your approval">
                <Switch checked={prefs.inAppEstimateApprovalRequired} onCheckedChange={() => toggle("inAppEstimateApprovalRequired")} />
              </SettingRow>
              <SettingRow label="Estimate Accepted by Client" description="When a client accepts your estimate via the proposal link or client portal">
                <Switch checked={prefs.inAppEstimateClientAccepted} onCheckedChange={() => toggle("inAppEstimateClientAccepted")} />
              </SettingRow>
              <SettingRow label="Estimate Declined by Client" description="When a client declines your estimate via the proposal link or client portal">
                <Switch checked={prefs.inAppEstimateClientRejected} onCheckedChange={() => toggle("inAppEstimateClientRejected")} />
              </SettingRow>
              <SettingRow label="Estimate Change Requested" description="When a client leaves a change request on an estimate">
                <Switch checked={prefs.inAppEstimateChangeRequest} onCheckedChange={() => toggle("inAppEstimateChangeRequest")} />
              </SettingRow>
              <div className="pb-1 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tickets</p>
              </div>
              <SettingRow label="New Ticket" description="When a new ticket is created">
                <Switch checked={prefs.inAppNewTicket} onCheckedChange={() => toggle("inAppNewTicket")} />
              </SettingRow>
              <SettingRow label="Ticket Assigned" description="When a ticket is assigned to you">
                <Switch checked={prefs.inAppTicketAssigned} onCheckedChange={() => toggle("inAppTicketAssigned")} />
              </SettingRow>
              <SettingRow label="Ticket Comment" description="When someone comments on a ticket assigned to you">
                <Switch checked={prefs.inAppTicketComment} onCheckedChange={() => toggle("inAppTicketComment")} />
              </SettingRow>
              <div className="pb-1 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contracts</p>
              </div>
              <SettingRow label="Contract Expiring Soon" description="When a contract you own is ending within 3 days and isn't set to auto-renew">
                <Switch checked={prefs.inAppContractExpiring} onCheckedChange={() => toggle("inAppContractExpiring")} />
              </SettingRow>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
