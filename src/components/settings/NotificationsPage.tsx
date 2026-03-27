"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Switch } from "@/components/ui/switch";
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "@/lib/hooks/use-notification-prefs";

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
}

export function NotificationsPage({ hideHeader = false }: NotificationsPageProps) {
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
          description="Configure your notification preferences"
          action={
            saved ? (
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            ) : undefined
          }
        />
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
        </div>
        <div className="divide-y px-5">
          <SettingRow label="Work Order Assigned" description="When a work order is assigned to you">
            <Switch checked={prefs.emailWorkOrderAssigned} onCheckedChange={() => toggle("emailWorkOrderAssigned")} />
          </SettingRow>
          <SettingRow label="Work Order Status Changed" description="When the status of your work order changes">
            <Switch checked={prefs.emailWorkOrderStatusChanged} onCheckedChange={() => toggle("emailWorkOrderStatusChanged")} />
          </SettingRow>
          <SettingRow label="Work Order Overdue" description="When a work order passes its due date">
            <Switch checked={prefs.emailWorkOrderOverdue} onCheckedChange={() => toggle("emailWorkOrderOverdue")} />
          </SettingRow>
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
          <SettingRow label="Low Stock Alert" description="When a part drops below its minimum stock level">
            <Switch checked={prefs.emailLowStockAlert} onCheckedChange={() => toggle("emailLowStockAlert")} />
          </SettingRow>
          <SettingRow label="PM Schedule Due" description="When a preventive maintenance schedule is due within 7 days">
            <Switch checked={prefs.emailPmScheduleDue} onCheckedChange={() => toggle("emailPmScheduleDue")} />
          </SettingRow>
          <SettingRow label="New Maintenance Request" description="When a new maintenance request is submitted">
            <Switch checked={prefs.emailNewMaintenanceRequest} onCheckedChange={() => toggle("emailNewMaintenanceRequest")} />
          </SettingRow>
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
          <SettingRow label="Work Order Assigned" description="When a work order is assigned to you">
            <Switch checked={prefs.inAppWorkOrderAssigned} onCheckedChange={() => toggle("inAppWorkOrderAssigned")} />
          </SettingRow>
          <SettingRow label="Work Order Status Changed" description="When the status of your work order changes">
            <Switch checked={prefs.inAppWorkOrderStatusChanged} onCheckedChange={() => toggle("inAppWorkOrderStatusChanged")} />
          </SettingRow>
          <SettingRow label="Work Order Overdue" description="When a work order passes its due date">
            <Switch checked={prefs.inAppWorkOrderOverdue} onCheckedChange={() => toggle("inAppWorkOrderOverdue")} />
          </SettingRow>
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
          <SettingRow label="Low Stock Alert" description="When a part drops below its minimum stock level">
            <Switch checked={prefs.inAppLowStockAlert} onCheckedChange={() => toggle("inAppLowStockAlert")} />
          </SettingRow>
          <SettingRow label="PM Schedule Due" description="When a preventive maintenance schedule is due within 7 days">
            <Switch checked={prefs.inAppPmScheduleDue} onCheckedChange={() => toggle("inAppPmScheduleDue")} />
          </SettingRow>
          <SettingRow label="New Maintenance Request" description="When a new maintenance request is submitted">
            <Switch checked={prefs.inAppNewMaintenanceRequest} onCheckedChange={() => toggle("inAppNewMaintenanceRequest")} />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}
