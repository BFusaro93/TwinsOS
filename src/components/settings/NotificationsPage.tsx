"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Switch } from "@/components/ui/switch";

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
  // Email notification toggles
  const [emailWorkOrderAssigned, setEmailWorkOrderAssigned] = useState(true);
  const [emailWorkOrderStatusChanged, setEmailWorkOrderStatusChanged] = useState(true);
  const [emailWorkOrderOverdue, setEmailWorkOrderOverdue] = useState(true);
  const [emailRequisitionApproved, setEmailRequisitionApproved] = useState(true);
  const [emailRequisitionRejected, setEmailRequisitionRejected] = useState(true);
  const [emailApprovalRequired, setEmailApprovalRequired] = useState(true);
  const [emailPoApprovalRequired, setEmailPoApprovalRequired] = useState(true);
  const [emailLowStockAlert, setEmailLowStockAlert] = useState(true);
  const [emailPmScheduleDue, setEmailPmScheduleDue] = useState(false);
  const [emailNewMaintenanceRequest, setEmailNewMaintenanceRequest] = useState(false);

  // In-app notification toggles
  const [inAppWorkOrderAssigned, setInAppWorkOrderAssigned] = useState(true);
  const [inAppWorkOrderStatusChanged, setInAppWorkOrderStatusChanged] = useState(true);
  const [inAppWorkOrderOverdue, setInAppWorkOrderOverdue] = useState(true);
  const [inAppRequisitionApproved, setInAppRequisitionApproved] = useState(true);
  const [inAppRequisitionRejected, setInAppRequisitionRejected] = useState(true);
  const [inAppApprovalRequired, setInAppApprovalRequired] = useState(true);
  const [inAppPoApprovalRequired, setInAppPoApprovalRequired] = useState(true);
  const [inAppLowStockAlert, setInAppLowStockAlert] = useState(true);
  const [inAppPmScheduleDue, setInAppPmScheduleDue] = useState(false);
  const [inAppNewMaintenanceRequest, setInAppNewMaintenanceRequest] = useState(false);

  return (
    <div className="flex h-full flex-col gap-6">
      {!hideHeader && (
        <PageHeader
          title="Notifications"
          description="Configure your notification preferences"
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
          <SettingRow
            label="Work Order Assigned"
            description="When a work order is assigned to you"
          >
            <Switch
              checked={emailWorkOrderAssigned}
              onCheckedChange={setEmailWorkOrderAssigned}
            />
          </SettingRow>
          <SettingRow
            label="Work Order Status Changed"
            description="When the status of your work order changes"
          >
            <Switch
              checked={emailWorkOrderStatusChanged}
              onCheckedChange={setEmailWorkOrderStatusChanged}
            />
          </SettingRow>
          <SettingRow
            label="Work Order Overdue"
            description="When a work order passes its due date"
          >
            <Switch
              checked={emailWorkOrderOverdue}
              onCheckedChange={setEmailWorkOrderOverdue}
            />
          </SettingRow>
          <SettingRow
            label="Requisition Approved"
            description="When your purchase requisition is approved"
          >
            <Switch
              checked={emailRequisitionApproved}
              onCheckedChange={setEmailRequisitionApproved}
            />
          </SettingRow>
          <SettingRow
            label="Requisition Rejected"
            description="When your purchase requisition is rejected"
          >
            <Switch
              checked={emailRequisitionRejected}
              onCheckedChange={setEmailRequisitionRejected}
            />
          </SettingRow>
          <SettingRow
            label="Approval Required"
            description="When any record requires your approval"
          >
            <Switch
              checked={emailApprovalRequired}
              onCheckedChange={setEmailApprovalRequired}
            />
          </SettingRow>
          <SettingRow
            label="PO Approval Required"
            description="When a purchase order requires your approval"
          >
            <Switch
              checked={emailPoApprovalRequired}
              onCheckedChange={setEmailPoApprovalRequired}
            />
          </SettingRow>
          <SettingRow
            label="Low Stock Alert"
            description="When a part drops below its minimum stock level"
          >
            <Switch
              checked={emailLowStockAlert}
              onCheckedChange={setEmailLowStockAlert}
            />
          </SettingRow>
          <SettingRow
            label="PM Schedule Due"
            description="When a preventive maintenance schedule is due within 7 days"
          >
            <Switch
              checked={emailPmScheduleDue}
              onCheckedChange={setEmailPmScheduleDue}
            />
          </SettingRow>
          <SettingRow
            label="New Maintenance Request"
            description="When a new maintenance request is submitted"
          >
            <Switch
              checked={emailNewMaintenanceRequest}
              onCheckedChange={setEmailNewMaintenanceRequest}
            />
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
          <SettingRow
            label="Work Order Assigned"
            description="When a work order is assigned to you"
          >
            <Switch
              checked={inAppWorkOrderAssigned}
              onCheckedChange={setInAppWorkOrderAssigned}
            />
          </SettingRow>
          <SettingRow
            label="Work Order Status Changed"
            description="When the status of your work order changes"
          >
            <Switch
              checked={inAppWorkOrderStatusChanged}
              onCheckedChange={setInAppWorkOrderStatusChanged}
            />
          </SettingRow>
          <SettingRow
            label="Work Order Overdue"
            description="When a work order passes its due date"
          >
            <Switch
              checked={inAppWorkOrderOverdue}
              onCheckedChange={setInAppWorkOrderOverdue}
            />
          </SettingRow>
          <SettingRow
            label="Requisition Approved"
            description="When your purchase requisition is approved"
          >
            <Switch
              checked={inAppRequisitionApproved}
              onCheckedChange={setInAppRequisitionApproved}
            />
          </SettingRow>
          <SettingRow
            label="Requisition Rejected"
            description="When your purchase requisition is rejected"
          >
            <Switch
              checked={inAppRequisitionRejected}
              onCheckedChange={setInAppRequisitionRejected}
            />
          </SettingRow>
          <SettingRow
            label="Approval Required"
            description="When any record requires your approval"
          >
            <Switch
              checked={inAppApprovalRequired}
              onCheckedChange={setInAppApprovalRequired}
            />
          </SettingRow>
          <SettingRow
            label="PO Approval Required"
            description="When a purchase order requires your approval"
          >
            <Switch
              checked={inAppPoApprovalRequired}
              onCheckedChange={setInAppPoApprovalRequired}
            />
          </SettingRow>
          <SettingRow
            label="Low Stock Alert"
            description="When a part drops below its minimum stock level"
          >
            <Switch
              checked={inAppLowStockAlert}
              onCheckedChange={setInAppLowStockAlert}
            />
          </SettingRow>
          <SettingRow
            label="PM Schedule Due"
            description="When a preventive maintenance schedule is due within 7 days"
          >
            <Switch
              checked={inAppPmScheduleDue}
              onCheckedChange={setInAppPmScheduleDue}
            />
          </SettingRow>
          <SettingRow
            label="New Maintenance Request"
            description="When a new maintenance request is submitted"
          >
            <Switch
              checked={inAppNewMaintenanceRequest}
              onCheckedChange={setInAppNewMaintenanceRequest}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}
