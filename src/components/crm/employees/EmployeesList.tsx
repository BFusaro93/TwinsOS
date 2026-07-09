"use client";

import { useState } from "react";
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeactivateEmployee,
} from "@/lib/hooks/use-employees";
import { useRoles } from "@/lib/hooks/use-roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, getAvatarColor } from "@/lib/utils";
import { Plus, Search, MoreHorizontal, UserCog, ChevronDown, Pencil } from "lucide-react";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { toast } from "sonner";
import type { CRMEmployee, EmploymentStatus, UserType } from "@/types/crm-employees";

// ── section header (SA-style dark bar) ────────────────────────────────────────

function SectionBar({ title }: { title: string }) {
  return (
    <div className="rounded-t-md bg-[#5a5a5a] px-4 py-2 text-sm font-semibold text-white">
      {title}
    </div>
  );
}

// ── form field helpers ────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-x-3 gap-y-1">
      <Label className={`text-right text-sm ${required ? "font-semibold" : "font-normal text-slate-500"}`}>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      <div>{children}</div>
    </div>
  );
}

function FieldInput({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input className="h-8 text-sm" {...props} />;
}

// ── personal information tab ──────────────────────────────────────────────────

function PersonalTab({
  form,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded border">
        <SectionBar title="Employee Details" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 p-4">
          {/* Left column */}
          <div className="space-y-2.5">
            <Field label="First Name" required>
              <FieldInput value={form.first_name ?? ""} onChange={(e) => onChange("first_name", e.target.value)} />
            </Field>
            <Field label="Middle Initial">
              <FieldInput value={form.middle_initial ?? ""} onChange={(e) => onChange("middle_initial", e.target.value)} className="h-8 w-16 text-sm" />
            </Field>
            <Field label="Last Name" required>
              <FieldInput value={form.last_name ?? ""} onChange={(e) => onChange("last_name", e.target.value)} />
            </Field>
            <Field label="Print On Check As">
              <FieldInput value={form.print_on_check_as ?? ""} onChange={(e) => onChange("print_on_check_as", e.target.value)} />
            </Field>
            <Field label="Email" required>
              <FieldInput type="email" value={form.email ?? ""} onChange={(e) => onChange("email", e.target.value)} />
            </Field>
            <Field label="Birth Date">
              <FieldInput type="date" value={form.birth_date ?? ""} onChange={(e) => onChange("birth_date", e.target.value)} />
            </Field>
            <Field label="Resource Code">
              <FieldInput value={form.resource_code ?? ""} onChange={(e) => onChange("resource_code", e.target.value)} placeholder="e.g. EKadziolka" />
            </Field>
          </div>
          {/* Right column */}
          <div className="space-y-2.5">
            <Field label="Address">
              <FieldInput value={form.address ?? ""} onChange={(e) => onChange("address", e.target.value)} />
            </Field>
            <Field label="City">
              <FieldInput value={form.city ?? ""} onChange={(e) => onChange("city", e.target.value)} />
            </Field>
            <Field label="State">
              <FieldInput value={form.state ?? ""} onChange={(e) => onChange("state", e.target.value)} placeholder="MA" />
            </Field>
            <Field label="Postal Code">
              <FieldInput value={form.zip ?? ""} onChange={(e) => onChange("zip", e.target.value)} />
            </Field>
            <Field label="Driver License">
              <FieldInput value={form.driver_license ?? ""} onChange={(e) => onChange("driver_license", e.target.value)} />
            </Field>
            <Field label="Certified Driver">
              <Checkbox checked={!!form.is_certified_driver} onCheckedChange={(c) => onChange("is_certified_driver", !!c)} />
            </Field>
            <Field label="License Expiration">
              <FieldInput type="date" value={form.license_expiration ?? ""} onChange={(e) => onChange("license_expiration", e.target.value)} />
            </Field>
            <Field label="Insurance Eligibility">
              <FieldInput type="date" value={form.insurance_eligibility ?? ""} onChange={(e) => onChange("insurance_eligibility", e.target.value)} />
            </Field>
            <Field label="Covered by Insurance">
              <Checkbox checked={!!form.covered_by_insurance} onCheckedChange={(c) => onChange("covered_by_insurance", !!c)} />
            </Field>
            <Field label="Applicator License">
              <FieldInput value={form.applicator_license ?? ""} onChange={(e) => onChange("applicator_license", e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div className="rounded border">
        <SectionBar title="Resource Tags" />
        <div className="p-4 space-y-1.5">
          <Input
            className="h-8 text-sm"
            value={(form.resource_tags ?? []).join(", ")}
            onChange={(e) => onChange("resource_tags", e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean))}
            placeholder="e.g. snow, mowing, irrigation"
          />
          <p className="text-xs text-slate-400">
            Type keywords or terms to group employees together. Then you can quickly select the group in the calendar.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── employment tab ────────────────────────────────────────────────────────────

const EMPLOYMENT_STATUS_OPTIONS: { value: EmploymentStatus; label: string }[] = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "seasonal", label: "Seasonal" },
  { value: "contractor", label: "Contractor" },
  { value: "terminated", label: "Terminated" },
];

function EmploymentTab({
  form,
  onChange,
  employees,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
  employees: CRMEmployee[];
}) {
  return (
    <div className="rounded border">
      <SectionBar title="Employment Information" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 p-4">
        <div className="space-y-2.5">
          <Field label="Date Hired">
            <FieldInput type="date" value={form.date_hired ?? ""} onChange={(e) => onChange("date_hired", e.target.value)} />
          </Field>
          <Field label="Phone">
            <FieldInput value={form.phone ?? ""} onChange={(e) => onChange("phone", e.target.value)} />
          </Field>
          <Field label="Cell Phone">
            <FieldInput value={form.cell_phone ?? ""} onChange={(e) => onChange("cell_phone", e.target.value)} />
          </Field>
          <Field label="Pager">
            <FieldInput value={form.pager ?? ""} onChange={(e) => onChange("pager", e.target.value)} />
          </Field>
          <Field label="Marital Status">
            <Select value={form.marital_status ?? ""} onValueChange={(v) => onChange("marital_status", v || null)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {["single", "married", "divorced", "widowed"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Spouse Name">
            <FieldInput value={form.spouse_name ?? ""} onChange={(e) => onChange("spouse_name", e.target.value)} />
          </Field>
          <Field label="Date Released">
            <FieldInput type="date" value={form.date_released ?? ""} onChange={(e) => onChange("date_released", e.target.value)} />
          </Field>
          <Field label="Reason for Release">
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              rows={3}
              value={form.reason_for_release ?? ""}
              onChange={(e) => onChange("reason_for_release", e.target.value)}
            />
          </Field>
        </div>
        <div className="space-y-2.5">
          <Field label="Citizenship">
            <FieldInput value={form.citizenship ?? ""} onChange={(e) => onChange("citizenship", e.target.value)} />
          </Field>
          <Field label="Emergency Phone">
            <FieldInput value={form.emergency_phone ?? ""} onChange={(e) => onChange("emergency_phone", e.target.value)} />
          </Field>
          <Field label="Emergency Contact">
            <FieldInput value={form.emergency_contact ?? ""} onChange={(e) => onChange("emergency_contact", e.target.value)} />
          </Field>
          <Field label="Number of Dependants">
            <FieldInput type="number" min="0" value={form.num_dependants ?? 0} onChange={(e) => onChange("num_dependants", parseInt(e.target.value) || 0)} className="h-8 w-20 text-sm" />
          </Field>
          <Field label="Spouse Phone">
            <FieldInput value={form.spouse_phone ?? ""} onChange={(e) => onChange("spouse_phone", e.target.value)} />
          </Field>
          <Field label="Rehire Date">
            <FieldInput type="date" value={form.rehire_date ?? ""} onChange={(e) => onChange("rehire_date", e.target.value)} />
          </Field>
          <Field label="Employment Status">
            <Select value={form.employment_status ?? "full_time"} onValueChange={(v) => onChange("employment_status", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Manager">
            <Select value={form.manager_id ?? "none"} onValueChange={(v) => onChange("manager_id", v === "none" ? null : v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── payroll / job costing tab ─────────────────────────────────────────────────

function PayrollTab({
  form,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Payroll */}
        <div className="rounded border">
          <SectionBar title="Payroll / Job Costing" />
          <div className="space-y-2.5 p-4">
            <Field label="Compensation Type">
              <Select value={form.compensation_type ?? ""} onValueChange={(v) => onChange("compensation_type", v || null)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {["hourly", "salary", "commission", "1099"].map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Resource PIN">
              <FieldInput value={form.resource_pin ?? ""} onChange={(e) => onChange("resource_pin", e.target.value)} placeholder="0000" className="h-8 w-24 text-sm" />
            </Field>
            <Field label="Eligible for Overtime">
              <Checkbox checked={!!form.eligible_overtime} onCheckedChange={(c) => onChange("eligible_overtime", !!c)} />
            </Field>
          </div>
        </div>
        {/* Right: Costing Info */}
        <div className="rounded border">
          <SectionBar title="Costing Information" />
          <div className="space-y-2.5 p-4">
            <Field label="Hourly Rate ($)">
              <FieldInput type="number" step="0.01" min="0"
                value={form.hourly_rate_cents != null ? (form.hourly_rate_cents / 100).toFixed(2) : "0.00"}
                onChange={(e) => onChange("hourly_rate_cents", Math.round(parseFloat(e.target.value || "0") * 100))}
                className="h-8 w-28 text-sm"
              />
            </Field>
            <Field label="Overtime Rate ($)">
              <FieldInput type="number" step="0.01" min="0"
                value={form.overtime_rate_cents != null ? (form.overtime_rate_cents / 100).toFixed(2) : "0.00"}
                onChange={(e) => onChange("overtime_rate_cents", Math.round(parseFloat(e.target.value || "0") * 100))}
                className="h-8 w-28 text-sm"
              />
            </Field>
            <Field label="Vacation Days / Year">
              <FieldInput type="number" min="0"
                value={form.vacation_days ?? 0}
                onChange={(e) => onChange("vacation_days", parseInt(e.target.value) || 0)}
                className="h-8 w-20 text-sm"
              />
            </Field>
            <Field label="Sick Days / Year">
              <FieldInput type="number" min="0"
                value={form.sick_days ?? 0}
                onChange={(e) => onChange("sick_days", parseInt(e.target.value) || 0)}
                className="h-8 w-20 text-sm"
              />
            </Field>
            <Field label="Commission %">
              <div className="flex items-center gap-1.5">
                <FieldInput type="number" step="0.1" min="0" max="100"
                  value={form.commission_pct ?? 0}
                  onChange={(e) => onChange("commission_pct", parseFloat(e.target.value) || 0)}
                  className="h-8 w-20 text-sm"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </Field>
          </div>
        </div>
      </div>

      {/* Legacy Payroll */}
      <div className="rounded border">
        <SectionBar title="Legacy Payroll" />
        <div className="space-y-2.5 p-4">
          <Field label="Payment Frequency">
            <Select value={form.payment_frequency ?? ""} onValueChange={(v) => onChange("payment_frequency", v || null)}>
              <SelectTrigger className="h-8 w-48 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {[
                  { value: "weekly", label: "Weekly" },
                  { value: "biweekly", label: "Bi-Weekly" },
                  { value: "semimonthly", label: "Semi-Monthly" },
                  { value: "monthly", label: "Monthly" },
                ].map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Last Pay Raise ($)">
            <FieldInput type="number" step="0.01" min="0"
              value={form.last_pay_raise_cents != null ? (form.last_pay_raise_cents / 100).toFixed(2) : "0.00"}
              onChange={(e) => onChange("last_pay_raise_cents", Math.round(parseFloat(e.target.value || "0") * 100))}
              className="h-8 w-28 text-sm"
            />
          </Field>
          <Field label="Last Pay Raise Date">
            <FieldInput type="date" value={form.last_pay_raise_date ?? ""} onChange={(e) => onChange("last_pay_raise_date", e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── user settings tab ─────────────────────────────────────────────────────────

const USER_TYPE_OPTIONS: { value: UserType; label: string }[] = [
  { value: "full_user", label: "Full User" },
  { value: "field", label: "Field" },
  { value: "view_only", label: "View Only" },
  { value: "no_access", label: "No Access" },
];

const USER_ROLES = [
  "Admin", "Manager", "Sales / Account Mgr", "Technician", "Purchaser", "Viewer",
];

function UserSettingsTab({
  form,
  onChange,
  roles,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
  roles: { id: string; name: string }[];
}) {
  return (
    <div className="rounded border">
      <SectionBar title="App Settings" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 p-4">
        <div className="space-y-2.5">
          <Field label="User Type">
            <Select value={form.user_type ?? "field"} onValueChange={(v) => onChange("user_type", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {USER_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Show in Selection Lists">
            <Checkbox checked={!!form.show_in_selection} onCheckedChange={(c) => onChange("show_in_selection", !!c)} />
          </Field>
          <Field label="Show in Calendar List">
            <Checkbox checked={!!form.show_in_calendar} onCheckedChange={(c) => onChange("show_in_calendar", !!c)} />
          </Field>
          <Field label="Field Time Clock">
            <Checkbox checked={!!form.field_time_clock} onCheckedChange={(c) => onChange("field_time_clock", !!c)} />
          </Field>
          <Field label="Office Time Clock">
            <Checkbox checked={!!form.office_time_clock} onCheckedChange={(c) => onChange("office_time_clock", !!c)} />
          </Field>
          <Field label="Send Text Alerts">
            <Checkbox checked={!!form.send_text_alerts} onCheckedChange={(c) => onChange("send_text_alerts", !!c)} />
          </Field>
          <Field label="User Role">
            <Select value={form.user_role ?? ""} onValueChange={(v) => onChange("user_role", v || null)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="CRM Role">
            <Select value={form.crm_role_id ?? "none"} onValueChange={(v) => onChange("crm_role_id", v === "none" ? null : v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="No role assigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No role</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Map Icon / Color">
            <FieldInput value={form.map_icon_color ?? ""} onChange={(e) => onChange("map_icon_color", e.target.value)} placeholder="e.g. Gold" />
          </Field>
          <Field label="Map Codes">
            <FieldInput value={form.map_codes ?? ""} onChange={(e) => onChange("map_codes", e.target.value)} />
          </Field>
          <Field label="Is Sales Rep">
            <Checkbox checked={!!form.is_sales_rep} onCheckedChange={(c) => onChange("is_sales_rep", !!c)} />
          </Field>
        </div>
        <div className="space-y-2.5">
          <Field label="Starting Address">
            <FieldInput value={form.starting_address ?? ""} onChange={(e) => onChange("starting_address", e.target.value)} />
          </Field>
          <Field label="Starting City">
            <FieldInput value={form.starting_city ?? ""} onChange={(e) => onChange("starting_city", e.target.value)} />
          </Field>
          <Field label="Starting State">
            <FieldInput value={form.starting_state ?? ""} onChange={(e) => onChange("starting_state", e.target.value)} />
          </Field>
          <Field label="Starting Zip">
            <FieldInput value={form.starting_zip ?? ""} onChange={(e) => onChange("starting_zip", e.target.value)} />
          </Field>
          <Field label="Starting Latitude">
            <FieldInput type="number" step="any"
              value={form.starting_lat ?? ""}
              onChange={(e) => onChange("starting_lat", e.target.value ? parseFloat(e.target.value) : null)}
            />
          </Field>
          <Field label="Starting Longitude">
            <FieldInput type="number" step="any"
              value={form.starting_lng ?? ""}
              onChange={(e) => onChange("starting_lng", e.target.value ? parseFloat(e.target.value) : null)}
            />
          </Field>
        </div>
      </div>

      {/* User account link */}
      <div className="mt-4 rounded border">
        <SectionBar title="User Account" />
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">
            All users are employees, but not all employees are users. Link this employee to a login account so they can access the app.
          </p>
          {form.user_id ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                Linked to user account
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-red-500 hover:text-red-700"
                onClick={() => onChange("user_id", null)}
              >
                Unlink
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <FieldInput
                placeholder="Paste user ID to link…"
                className="flex-1"
                onChange={(e) => {
                  if (e.target.value) onChange("user_id", e.target.value);
                }}
              />
              <p className="text-xs text-slate-400 shrink-0">or invite via Settings → Users</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── employee dialog ───────────────────────────────────────────────────────────

function EmployeeDialog({
  employee,
  open,
  onOpenChange,
}: {
  employee?: CRMEmployee;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: employees } = useEmployees(false);
  const { data: crmRoles } = useRoles(true);
  const { mutateAsync: create, isPending: creating } = useCreateEmployee();
  const { mutateAsync: update, isPending: updating } = useUpdateEmployee();

  const isNew = !employee;

  const defaultForm = {
    first_name: "", last_name: "", employment_status: "full_time",
    user_type: "field", show_in_selection: true, show_in_calendar: true,
    field_time_clock: true, office_time_clock: false,
    eligible_overtime: false, is_certified_driver: false,
    covered_by_insurance: false, is_sales_rep: false, is_active: true,
    num_dependants: 0, hourly_rate_cents: 0, overtime_rate_cents: 0,
    vacation_days: 0, sick_days: 0, commission_pct: 0, last_pay_raise_cents: 0,
    resource_tags: [] as string[],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function employeeToForm(e: CRMEmployee): Record<string, any> {
    return {
      first_name: e.firstName, middle_initial: e.middleInitial, last_name: e.lastName,
      print_on_check_as: e.printOnCheckAs, email: e.email, birth_date: e.birthDate,
      resource_code: e.resourceCode, address: e.address, city: e.city, state: e.state,
      zip: e.zip, driver_license: e.driverLicense, is_certified_driver: e.isCertifiedDriver,
      license_expiration: e.licenseExpiration, insurance_eligibility: e.insuranceEligibility,
      covered_by_insurance: e.coveredByInsurance, applicator_license: e.applicatorLicense,
      resource_tags: e.resourceTags,
      date_hired: e.dateHired, phone: e.phone, cell_phone: e.cellPhone, pager: e.pager,
      marital_status: e.maritalStatus, spouse_name: e.spouseName, i9_number: e.i9Number,
      date_released: e.dateReleased, reason_for_release: e.reasonForRelease,
      citizenship: e.citizenship, emergency_phone: e.emergencyPhone,
      emergency_contact: e.emergencyContact, num_dependants: e.numDependants,
      spouse_phone: e.spousePhone, i9_expiration_date: e.i9ExpirationDate,
      rehire_date: e.rehireDate, employment_status: e.employmentStatus,
      manager_id: e.managerId,
      compensation_type: e.compensationType, resource_pin: e.resourcePin,
      eligible_overtime: e.eligibleOvertime, hourly_rate_cents: e.hourlyRateCents,
      overtime_rate_cents: e.overtimeRateCents, vacation_days: e.vacationDays,
      sick_days: e.sickDays, commission_pct: e.commissionPct,
      payment_frequency: e.paymentFrequency, last_pay_raise_cents: e.lastPayRaiseCents,
      last_pay_raise_date: e.lastPayRaiseDate,
      user_type: e.userType, show_in_selection: e.showInSelection,
      show_in_calendar: e.showInCalendar, field_time_clock: e.fieldTimeClock,
      office_time_clock: e.officeTimeClock, send_text_alerts: e.sendTextAlerts,
      user_role: e.userRole, route_sheet_format: e.routeSheetFormat,
      map_icon_color: e.mapIconColor, map_codes: e.mapCodes, is_sales_rep: e.isSalesRep,
      starting_address: e.startingAddress, starting_city: e.startingCity,
      starting_state: e.startingState, starting_zip: e.startingZip,
      starting_lat: e.startingLat, starting_lng: e.startingLng,
      notes: e.notes, is_active: e.isActive,
    user_id: e.userId,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<Record<string, any>>(
    employee ? employeeToForm(employee) : defaultForm
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onChange(key: string, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    if (!form.first_name || !form.last_name) {
      toast.error("First and last name are required");
      return;
    }
    try {
      if (isNew) {
        await create(form);
        toast.success("Employee created");
      } else {
        await update({ id: employee!.id, updates: form });
        toast.success("Employee saved");
      }
      onOpenChange(false);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to save employee: ${msg}`);
    }
  }

  const otherEmployees = (employees ?? []).filter((e) => e.id !== employee?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 max-h-[92vh] flex flex-col">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="text-lg font-bold">
            {isNew ? "New Employee" : `Edit Employee`}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="personal" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="shrink-0 border-b bg-white rounded-none justify-start px-4 py-0 h-10 gap-0 flex-wrap">
            {[
              { value: "personal", label: "Personal Information" },
              { value: "employment", label: "Employment" },
              { value: "payroll", label: "Payroll / Job Costing" },
              { value: "user_settings", label: "User Settings" },
              { value: "notes", label: "Notes" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-full rounded-none border-b-2 border-transparent px-3 py-0 text-sm data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="personal" className="mt-0">
              <PersonalTab form={form} onChange={onChange} />
            </TabsContent>
            <TabsContent value="employment" className="mt-0">
              <EmploymentTab form={form} onChange={onChange} employees={otherEmployees} />
            </TabsContent>
            <TabsContent value="payroll" className="mt-0">
              <PayrollTab form={form} onChange={onChange} />
            </TabsContent>
            <TabsContent value="user_settings" className="mt-0">
              <UserSettingsTab form={form} onChange={onChange} roles={crmRoles ?? []} />
            </TabsContent>
            <TabsContent value="notes" className="mt-0">
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                rows={10}
                value={form.notes ?? ""}
                onChange={(e) => onChange("notes", e.target.value)}
                placeholder="Add notes about this employee…"
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 border-t px-6 py-3 bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={creating || updating}>
            {creating || updating ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── status badge ──────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  full_time:   "bg-green-100 text-green-700",
  part_time:   "bg-blue-100 text-blue-700",
  seasonal:    "bg-yellow-100 text-yellow-700",
  contractor:  "bg-purple-100 text-purple-700",
  terminated:  "bg-red-100 text-red-600",
};

// ── read-only detail panel (used in both list + table views) ──────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 py-1.5 text-sm">
      <span className="text-right text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-800 font-medium">{value || "—"}</span>
    </div>
  );
}

function EmployeeDetail({
  employee,
  onEdit,
}: {
  employee: CRMEmployee;
  onEdit: () => void;
}) {
  const name = `${employee.firstName} ${employee.lastName}`;
  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Top card */}
      <div className="border-b bg-slate-50 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white uppercase ${getAvatarColor(name)}`}>
              {employee.firstName[0]}{employee.lastName[0]}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{name}</h2>
              <div className="mt-1 flex items-center gap-2">
                <Badge className={`capitalize text-xs border-0 ${STATUS_COLOR[employee.employmentStatus] ?? "bg-slate-100 text-slate-600"}`}>
                  {employee.employmentStatus.replace("_", " ")}
                </Badge>
                {employee.resourceCode && (
                  <span className="font-mono text-xs text-slate-400">{employee.resourceCode}</span>
                )}
              </div>
            </div>
          </div>
          <PermissionGate permission="emp_edit">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 px-6 py-4 space-y-1">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</p>
        <DetailRow label="Email" value={employee.email} />
        <DetailRow label="Cell" value={employee.cellPhone} />
        <DetailRow label="Phone" value={employee.phone} />
        <DetailRow label="Address" value={
          [employee.address, employee.city, employee.state, employee.zip].filter(Boolean).join(", ") || null
        } />

        <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Employment</p>
        <DetailRow label="Type" value={employee.userType?.replace("_", " ")} />
        <DetailRow label="Manager" value={employee.managerName} />
        <DetailRow label="Date Hired" value={
          employee.dateHired
            ? new Date(employee.dateHired + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
            : null
        } />
        <DetailRow label="Hourly Rate" value={employee.hourlyRateCents > 0 ? formatCurrency(employee.hourlyRateCents) : null} />
        <DetailRow label="Bill Rate" value={employee.overtimeRateCents > 0 ? formatCurrency(employee.overtimeRateCents) : null} />

        {(employee.emergencyContact || employee.emergencyPhone) && (
          <>
            <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Emergency Contact</p>
            <DetailRow label="Name" value={employee.emergencyContact} />
            <DetailRow label="Phone" value={employee.emergencyPhone} />
          </>
        )}
      </div>
    </div>
  );
}


// ── shared table body ─────────────────────────────────────────────────────────

function EmployeeTable({
  employees,
  isLoading,
  selectedId,
  onSelect,
  onEdit,
  onDeactivate,
  colSpan,
}: {
  employees: CRMEmployee[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (e: CRMEmployee) => void;
  onEdit: (e: CRMEmployee) => void;
  onDeactivate: (id: string, name: string) => void;
  colSpan: number;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 z-10">
        <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
          <th className="px-4 py-3">Name</th>
          <th className="px-4 py-3">Resource Code</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Type</th>
          <th className="px-4 py-3">Phone</th>
          <th className="px-4 py-3">Email</th>
          <th className="px-4 py-3 text-right">Hourly Rate</th>
          <th className="px-4 py-3">Date Hired</th>
          <th className="w-10 px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b">
              {Array.from({ length: colSpan }).map((__, j) => (
                <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
              ))}
            </tr>
          ))
        ) : employees.length === 0 ? (
          <tr>
            <td colSpan={colSpan} className="py-20 text-center">
              <div className="flex flex-col items-center gap-2">
                <UserCog className="h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-400">No employees match your search</p>
              </div>
            </td>
          </tr>
        ) : (
          employees.map((e) => (
            <tr
              key={e.id}
              className={`border-b cursor-pointer transition-colors
                ${selectedId === e.id ? "bg-brand-50" : "hover:bg-slate-50"}
                ${!e.isActive ? "opacity-50" : ""}`}
              onClick={() => onSelect(e)}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-900">{e.firstName} {e.lastName}</span>
                  {e.managerName && (
                    <span className="text-xs text-slate-400">· Mgr: {e.managerName}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 text-slate-500">{e.resourceCode ?? "—"}</td>
              <td className="px-4 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLOR[e.employmentStatus] ?? "bg-slate-100 text-slate-600"}`}>
                  {e.employmentStatus.replace("_", " ")}
                </span>
              </td>
              <td className="px-4 py-2.5 capitalize text-slate-500 text-xs">{e.userType?.replace("_", " ") ?? "—"}</td>
              <td className="px-4 py-2.5 text-slate-600">{e.cellPhone ?? e.phone ?? "—"}</td>
              <td className="px-4 py-2.5 text-slate-500">{e.email ?? "—"}</td>
              <td className="px-4 py-2.5 text-right font-medium text-slate-700">
                {e.hourlyRateCents > 0 ? formatCurrency(e.hourlyRateCents) : "—"}
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                {e.dateHired ? new Date(e.dateHired + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                }) : "—"}
              </td>
              <td className="px-4 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="rounded p-1 text-slate-400 hover:bg-slate-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <PermissionGate permission="emp_edit">
                      <DropdownMenuItem onClick={() => onEdit(e)}>Edit</DropdownMenuItem>
                    </PermissionGate>
                    {e.isActive && (
                      <PermissionGate permission="emp_manage">
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => onDeactivate(e.id, `${e.firstName} ${e.lastName}`)}
                        >
                          Deactivate
                        </DropdownMenuItem>
                      </PermissionGate>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ── list panel (search + cards — lives inside MasterDetailLayout) ─────────────

export function EmployeeListPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (e: CRMEmployee) => void;
}) {
  const { data: employees, isLoading } = useEmployees(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = (employees ?? []).filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      (e.resourceCode ?? "").toLowerCase().includes(q) ||
      (e.email ?? "").toLowerCase().includes(q);
    return matchesSearch && (showInactive || e.isActive);
  });

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
            <Checkbox
              checked={showInactive}
              onCheckedChange={(c) => setShowInactive(!!c)}
            />
            Show terminated
          </label>
          <span className="text-xs text-slate-400">
            {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <UserCog className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">No employees match your search</p>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((e) => (
              <li
                key={e.id}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors border-l-2
                  ${selectedId === e.id ? "bg-brand-50 border-l-brand-500" : "hover:bg-slate-50 border-l-transparent"}
                  ${!e.isActive ? "opacity-50" : ""}`}
                onClick={() => onSelect(e)}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white uppercase ${getAvatarColor(`${e.firstName} ${e.lastName}`)}`}>
                  {e.firstName[0]}{e.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800 text-sm">
                    {e.firstName} {e.lastName}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className={`shrink-0 rounded-full border-0 px-1.5 py-0 text-[10px] capitalize ${STATUS_COLOR[e.employmentStatus] ?? "bg-slate-100 text-slate-600"}`}>
                      {e.employmentStatus.replace("_", " ")}
                    </Badge>
                    {e.resourceCode && (
                      <span className="font-mono text-xs text-slate-400">{e.resourceCode}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── table view (full-width, opens sheet on row click) ─────────────────────────

export function EmployeesTable({
  onSelect,
}: {
  onSelect: (e: CRMEmployee) => void;
}) {
  const { data: employees, isLoading } = useEmployees(false);
  const { mutateAsync: deactivate } = useDeactivateEmployee();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = (employees ?? []).filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      (e.resourceCode ?? "").toLowerCase().includes(q) ||
      (e.email ?? "").toLowerCase().includes(q);
    return matchesSearch && (showInactive || e.isActive);
  });

  async function handleDeactivate(id: string, name: string) {
    if (!confirm(`Deactivate ${name}?`)) return;
    try {
      await deactivate(id);
      toast.success(`${name} deactivated`);
    } catch { toast.error("Failed to deactivate"); }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Search name, resource code, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
          <Checkbox checked={showInactive} onCheckedChange={(c) => setShowInactive(!!c)} />
          Show terminated
        </label>
        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <EmployeeTable
          employees={filtered}
          isLoading={isLoading}
          selectedId={null}
          onSelect={onSelect}
          onEdit={onSelect}
          onDeactivate={handleDeactivate}
          colSpan={9}
        />
      </div>
    </div>
  );
}

// ── detail panel (exported for use in page) ───────────────────────────────────

export { EmployeeDetail, EmployeeDialog };
