"use client";

import { useState } from "react";
import { Plus, UserCog, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { useEmployees, useBulkImportEmployees } from "@/lib/hooks/use-employees";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  EmployeeListPanel,
  EmployeesTable,
  EmployeeDetail,
  EmployeeDialog,
} from "@/components/crm/employees/EmployeesList";
import type { CRMEmployee } from "@/types/crm-employees";

const EMPLOYEE_TEMPLATE_COLUMNS = [
  "firstName", "lastName", "email", "phone", "cellPhone",
  "address", "city", "state", "zip", "dateHired", "resourceCode", "hourlyRate",
];

export default function EmployeesPage() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const { data: employees } = useEmployees(false);
  const { mutateAsync: bulkImportEmployees } = useBulkImportEmployees();
  const [selected, setSelected] = useState<CRMEmployee | null>(null);
  const [editEmployee, setEditEmployee] = useState<CRMEmployee | "new" | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");

  function openEdit(e?: CRMEmployee) {
    setEditEmployee(e ?? "new");
  }

  const viewToggle = (
    <div className="flex items-center rounded-md border bg-white shadow-sm">
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-r-none border-r px-3", viewMode === "list" && "bg-slate-100 font-semibold")}
        onClick={() => setViewMode("list")}
      >
        <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
        List
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-l-none px-3", viewMode === "table" && "bg-slate-100 font-semibold")}
        onClick={() => setViewMode("table")}
      >
        <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
        Table
      </Button>
    </div>
  );

  if (!permissionsLoading && !can("emp_view_info")) {
    return (
      <EmptyState
        icon={UserCog}
        title="No access"
        description="You don't have permission to view Employees."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Employees"
        description="Manage your team members, roles, and payroll info"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {viewToggle}
            <ImportExportMenu
              entityLabel="Employees"
              templateColumns={EMPLOYEE_TEMPLATE_COLUMNS}
              templateFilename="employees-template.csv"
              requiredColumns={["firstName", "lastName"]}
              onExport={() =>
                exportCSV(
                  (employees ?? []).map((e) => ({
                    firstName: e.firstName,
                    lastName: e.lastName,
                    email: e.email ?? "",
                    phone: e.phone ?? "",
                    cellPhone: e.cellPhone ?? "",
                    address: e.address ?? "",
                    city: e.city ?? "",
                    state: e.state ?? "",
                    zip: e.zip ?? "",
                    dateHired: e.dateHired ?? "",
                    resourceCode: e.resourceCode ?? "",
                    hourlyRate: e.hourlyRateCents != null ? (e.hourlyRateCents / 100).toFixed(2) : "",
                  })),
                  "employees-export.csv"
                )
              }
              onImport={async (rows) => {
                const result = await bulkImportEmployees(rows);
                const { succeeded, failed } = result;
                const message = failed.length > 0
                  ? `Employees import: ${succeeded} succeeded, ${failed.length} failed — see details below.`
                  : `Employees import: ${succeeded} succeeded.`;
                toast[failed.length > 0 ? "warning" : "success"](message);
                return result;
              }}
            />
            <PermissionGate permission="emp_add">
              <Button size="sm" onClick={() => openEdit()}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Employee
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden">
        {viewMode === "list" ? (
          <MasterDetailLayout
            hasSelection={!!selected}
            onBack={() => setSelected(null)}
            listPanel={
              <EmployeeListPanel
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
            }
            detailPanel={
              selected ? (
                <EmployeeDetail employee={selected} onEdit={() => openEdit(selected)} />
              ) : null
            }
            emptyState={
              <EmptyState
                icon={UserCog}
                title="Select an employee"
                description="Choose an employee from the list to view their profile."
              />
            }
          />
        ) : (
          <EmployeesTable
            onSelect={(e) => {
              setSelected(e);
              setViewMode("list");
            }}
          />
        )}
      </div>

      {/* Table-view detail sheet */}
      <Sheet
        open={viewMode === "table" && !!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      >
        <SheetContent className="flex w-full flex-col overflow-hidden p-0 md:w-[560px] md:max-w-[560px]">
          {selected && (
            <EmployeeDetail employee={selected} onEdit={() => openEdit(selected)} />
          )}
        </SheetContent>
      </Sheet>

      {/* Edit dialog */}
      {editEmployee && (
        <EmployeeDialog
          employee={editEmployee === "new" ? undefined : editEmployee}
          open={!!editEmployee}
          onOpenChange={(o) => { if (!o) setEditEmployee(null); }}
        />
      )}
    </div>
  );
}
