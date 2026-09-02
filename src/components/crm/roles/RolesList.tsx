"use client";

import { useState } from "react";
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from "@/lib/hooks/use-roles";
import {
  PERMISSION_TABS,
  allKeysInTab,
  allKeysInSection,
  type CRMRole,
  type Permissions,
} from "@/types/crm-roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { PermissionGate, useGate } from "@/components/shared/PermissionGate";
import { toast } from "sonner";

// ── permission section component ──────────────────────────────────────────────

function PermSection({
  sectionKey,
  tabKey,
  permissions,
  onChange,
}: {
  sectionKey: string;
  tabKey: string;
  permissions: Permissions;
  onChange: (key: string, value: boolean) => void;
}) {
  const section = PERMISSION_TABS[tabKey].sections[sectionKey];
  const keys = allKeysInSection(tabKey, sectionKey);
  const allChecked = keys.every((k) => !!permissions[k]);
  const someChecked = keys.some((k) => !!permissions[k]);

  function toggleAll() {
    const next = !allChecked;
    keys.forEach((k) => onChange(k, next));
  }

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      {/* Section header with select-all checkbox */}
      <div className="flex items-center gap-2 mb-3 border-b pb-2">
        <Checkbox
          checked={allChecked}
          data-state={someChecked && !allChecked ? "indeterminate" : undefined}
          onCheckedChange={toggleAll}
          className="h-3.5 w-3.5"
        />
        <span className="text-sm font-semibold text-slate-700">{section.label}</span>
      </div>
      <div className="space-y-1.5">
        {Object.entries(section.permissions).map(([key, label]) => (
          <label key={key} className="flex items-start gap-2 cursor-pointer group">
            <Checkbox
              checked={!!permissions[key]}
              onCheckedChange={(c) => onChange(key, !!c)}
              className="h-3.5 w-3.5 mt-0.5 shrink-0"
            />
            <span className="text-xs text-slate-600 group-hover:text-slate-900 leading-snug">
              {label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── tab content ───────────────────────────────────────────────────────────────

function PermTab({
  tabKey,
  permissions,
  onChange,
}: {
  tabKey: string;
  permissions: Permissions;
  onChange: (key: string, value: boolean) => void;
}) {
  const tab = PERMISSION_TABS[tabKey];
  const allKeys = allKeysInTab(tabKey);
  const allChecked = allKeys.every((k) => !!permissions[k]);

  function toggleAll() {
    const next = !allChecked;
    allKeys.forEach((k) => onChange(k, next));
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-500">
        <Checkbox
          checked={allChecked}
          onCheckedChange={toggleAll}
          className="h-3.5 w-3.5"
        />
        Select all items on this tab
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.keys(tab.sections).map((sectionKey) => (
          <PermSection
            key={sectionKey}
            tabKey={tabKey}
            sectionKey={sectionKey}
            permissions={permissions}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

// ── role dialog ───────────────────────────────────────────────────────────────

function RoleDialog({
  role,
  open,
  onOpenChange,
}: {
  role?: CRMRole;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { mutateAsync: create, isPending: creating } = useCreateRole();
  const { mutateAsync: update, isPending: updating } = useUpdateRole();

  const isNew = !role;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<Permissions>(role?.permissions ?? {});

  function handleChange(key: string, value: boolean) {
    setPermissions((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Role name is required"); return; }
    try {
      if (isNew) {
        await create({ name: name.trim(), description: description || undefined, permissions });
        toast.success("Role created");
      } else {
        await update({ id: role!.id, updates: { name: name.trim(), description: description || null, permissions } });
        toast.success("Role saved");
      }
      onOpenChange(false);
    } catch {
      toast.error("Failed to save role");
    }
  }

  const tabKeys = Object.keys(PERMISSION_TABS);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 gap-0 max-h-[92vh] flex flex-col">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle className="text-xl font-bold">
            {isNew ? "New Role" : `Edit - ${role?.name}`}
          </DialogTitle>
        </DialogHeader>

        {/* Name + description */}
        <div className="shrink-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-6 pt-4 pb-3">
          <Label className="text-sm text-right self-center">Name</Label>
          <Input
            className="h-8 text-sm max-w-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Label className="text-sm text-right self-center">Description</Label>
          <Input
            className="h-8 text-sm max-w-xs"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Permission tabs */}
        <Tabs defaultValue={tabKeys[0]} className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-t bg-white px-6">
            <TabsList className="h-auto flex-wrap justify-start gap-0 rounded-none bg-transparent p-0">
              {tabKeys.map((tabKey) => (
                <TabsTrigger
                  key={tabKey}
                  value={tabKey}
                  className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-600 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
                >
                  {PERMISSION_TABS[tabKey].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {tabKeys.map((tabKey) => (
              <TabsContent key={tabKey} value={tabKey} className="mt-0">
                <PermTab tabKey={tabKey} permissions={permissions} onChange={handleChange} />
              </TabsContent>
            ))}
          </div>
        </Tabs>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 border-t px-6 py-3 bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={creating || updating}>
            {creating || updating ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── main list ─────────────────────────────────────────────────────────────────

type ActiveFilter = "active" | "inactive" | "all";

export function RolesList() {
  const { data: roles, isLoading } = useRoles(false);
  const { mutateAsync: update } = useUpdateRole();
  const { mutateAsync: deleteRole } = useDeleteRole();
  const { can } = useGate();
  const canManageRoles = can("allow_roles_access");
  const [filter, setFilter] = useState<ActiveFilter>("active");
  const [dialogRole, setDialogRole] = useState<CRMRole | "new" | null>(null);

  const filtered = (roles ?? []).filter((r) =>
    filter === "all" ||
    (filter === "active" && r.isActive) ||
    (filter === "inactive" && !r.isActive)
  );

  async function handleToggleActive(role: CRMRole) {
    try {
      await update({ id: role.id, updates: { is_active: !role.isActive } });
    } catch {
      toast.error("Failed to update role");
    }
  }

  async function handleDelete(role: CRMRole) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await deleteRole(role.id);
      toast.success("Role deleted");
    } catch {
      toast.error("Failed to delete role");
    }
  }

  const TAB_FILTERS: { value: ActiveFilter; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Roles</h1>
          <p className="text-sm text-slate-500">Define permissions for each CRM role</p>
        </div>
        <PermissionGate permission="allow_roles_access">
          <Button onClick={() => setDialogRole("new")}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Role
          </Button>
        </PermissionGate>
      </div>

      {/* Dark toolbar */}
      <div className="border-b bg-[#4a4a4a] px-4 py-2 flex items-center gap-3">
        <div className="flex items-center">
          {TAB_FILTERS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                filter === t.value
                  ? "bg-white text-slate-800"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-slate-50">
            <tr className="text-left text-xs font-semibold text-slate-500">
              <th className="w-10 px-4 py-3"><input type="checkbox" className="rounded border-slate-300 accent-brand-500" /></th>
              <th className="px-4 py-3">Role Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Modified</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <ShieldCheck className="h-8 w-8 text-slate-200" />
                    <p className="text-sm text-slate-400">No roles found</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((role) => (
                <tr
                  key={role.id}
                  className={`border-b ${canManageRoles ? "cursor-pointer hover:bg-slate-50" : "cursor-default"}`}
                  onClick={() => canManageRoles && setDialogRole(role)}
                >
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="rounded border-slate-300 accent-brand-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-brand-600 hover:underline font-medium">{role.name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{role.description ?? "—"}</td>
                  <td
                    className="px-4 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className={`text-sm transition-colors ${role.isActive ? "text-slate-700 hover:text-red-500" : "text-slate-400 hover:text-green-600"}`}
                      onClick={() => handleToggleActive(role)}
                    >
                      {role.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">
                    {new Date(role.updatedAt).toLocaleDateString("en-US", {
                      month: "numeric", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <PermissionGate permission="allow_roles_access">
                      <button
                        onClick={() => handleDelete(role)}
                        className="text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </PermissionGate>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {dialogRole && (
        <RoleDialog
          role={dialogRole === "new" ? undefined : dialogRole}
          open={!!dialogRole}
          onOpenChange={(o) => { if (!o) setDialogRole(null); }}
        />
      )}
    </div>
  );
}
