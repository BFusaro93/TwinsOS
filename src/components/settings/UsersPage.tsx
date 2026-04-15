"use client";

import { useState, useEffect, useMemo } from "react";
import { useStickyState } from "@/lib/hooks/use-sticky-state";
import { useUsers, useInviteUser, useUpdateUserRole, useDeactivateUser } from "@/lib/hooks/use-users";
import type { OrgUser } from "@/types";
import { Check, Plus, Trash2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface CustomRole {
  id: string;
  name: string;
  description: string;
  baseRole: "admin" | "manager" | "purchaser" | "technician" | "viewer" | "requestor";
  permissions: string[];
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-teal-500", "bg-indigo-500", "bg-slate-400",
];

function avatarInitials(name: string): string {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(id: string): string {
  const code = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

const ROLE_LABELS: Record<OrgUser["role"], string> = {
  admin: "Admin",
  manager: "Manager",
  purchaser: "Purchaser",
  technician: "Technician",
  viewer: "Viewer",
  requestor: "Requestor",
};

const ROLES = [
  {
    name: "Admin",
    key: "admin",
    description: "Full access to all modules, settings, and user management.",
    permissions: [
      "Manage all users and roles",
      "Access all PO and CMMS records",
      "Configure organization settings",
      "Approve any requisition or purchase order",
      "View all reports",
    ],
  },
  {
    name: "Manager",
    key: "manager",
    description: "Operational oversight across purchasing and maintenance.",
    permissions: [
      "Approve and reject requisitions and POs within their limit",
      "Create and manage work orders",
      "View and edit all assets and vehicles",
      "Access vendor and product catalog",
      "View reports",
    ],
  },
  {
    name: "Purchaser",
    key: "purchaser",
    description: "Manages the procurement lifecycle from requisition to receiving.",
    permissions: [
      "Create and submit purchase requisitions",
      "Create and send purchase orders",
      "Receive goods and update inventory",
      "Manage vendor records",
      "View product catalog",
    ],
  },
  {
    name: "Technician",
    key: "technician",
    description: "Executes and logs maintenance work in the field.",
    permissions: [
      "View and update assigned work orders",
      "Log labor and parts on work orders",
      "Submit maintenance requests",
      "View asset and vehicle details",
      "Log meter readings",
    ],
  },
  {
    name: "Viewer",
    key: "viewer",
    description: "Read-only access to view records without making changes.",
    permissions: [
      "View all records across both modules",
      "No create, edit, or delete access",
      "Cannot approve or reject records",
    ],
  },
  {
    name: "Requestor",
    key: "requestor",
    description: "Limited access to submit work order requests and purchase requisitions only.",
    permissions: [
      "Submit maintenance requests",
      "Create purchase requisitions (draft only)",
      "View status of their own submitted records",
      "Cannot approve, edit, or delete any records",
      "No access to assets, vendors, or inventory",
    ],
  },
];

const ALL_PERMISSIONS: string[] = Array.from(
  new Set(ROLES.flatMap((r) => r.permissions))
);

function statusBadgeClass(status: OrgUser["status"]): string {
  switch (status) {
    case "active":
      return "border-green-200 bg-green-100 text-green-700";
    case "invited":
      return "border-amber-200 bg-amber-100 text-amber-700";
    case "inactive":
      return "border-slate-200 bg-slate-100 text-slate-500";
  }
}

function statusLabel(status: OrgUser["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "invited":
      return "Invited";
    case "inactive":
      return "Inactive";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// InviteUserDialog (inline)
// ---------------------------------------------------------------------------

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (name: string, email: string, role: OrgUser["role"]) => Promise<void>;
  submitting?: boolean;
  customRoles?: CustomRole[];
}

function InviteUserDialog({ open, onOpenChange, onInvite, submitting = false, customRoles = [] }: InviteUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Value is either a system role key or a custom role id (prefixed "custom-")
  const [role, setRole] = useState("");

  function reset() {
    setName("");
    setEmail("");
    setRole("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !role) return;
    // Resolve custom role id → its baseRole for the DB
    const customMatch = customRoles.find((cr) => cr.id === role);
    const resolvedRole = (customMatch ? customMatch.baseRole : role) as OrgUser["role"];
    await onInvite(name.trim(), email.trim(), resolvedRole);
    reset();
    onOpenChange(false);
  }

  function handleOpenChange(val: boolean) {
    if (!val) reset();
    onOpenChange(val);
  }

  const isValid = name.trim().length > 0 && email.trim().length > 0 && role !== "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-name">Full Name</Label>
            <Input
              id="invite-name"
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="jane@greenlawn.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectLabel>System Roles</SelectLabel>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="purchaser">Purchaser</SelectItem>
                <SelectItem value="technician">Technician</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="requestor">Requestor</SelectItem>
                {customRoles.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectLabel>Custom Roles</SelectLabel>
                    {customRoles.map((cr) => (
                      <SelectItem key={cr.id} value={cr.id}>
                        {cr.name}
                        <span className="ml-1.5 text-xs text-slate-400">({cr.baseRole})</span>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || submitting}>
              {submitting ? "Sending…" : "Send Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// UsersPage
// ---------------------------------------------------------------------------

export function UsersPage() {
  const { data: rawUsers = [], isLoading } = useUsers();
  const { mutate: inviteUser, isPending: inviting } = useInviteUser();
  const { mutate: updateRole } = useUpdateUserRole();
  const { mutate: deactivate } = useDeactivateUser();

  const users = useMemo(
    () =>
      rawUsers.map((u) => ({
        ...u,
        joinedAt: u.createdAt,
        avatarInitials: avatarInitials(u.name),
        avatarColor: avatarColor(u.id),
      })),
    [rawUsers]
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  // Persist custom roles across page refreshes
  const [customRoles, setCustomRoles] = useStickyState<CustomRole[]>("custom-roles", []);
  const [customRoleOpen, setCustomRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRoleBase, setNewRoleBase] = useState<CustomRole["baseRole"]>("technician");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (customRoleOpen) {
      const basePerms = ROLES.find((r) => r.key === newRoleBase)?.permissions ?? [];
      setSelectedPermissions(new Set(basePerms));
    }
  }, [customRoleOpen]);

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "active").length;
  const pendingInvites = users.filter((u) => u.status === "invited").length;

  function handleRoleChange(userId: string, newRole: OrgUser["role"]) {
    updateRole({ userId, role: newRole });
  }

  function handleDeactivate(userId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to deactivate this user? They will lose access to the platform."
    );
    if (!confirmed) return;
    deactivate(userId);
  }

  async function handleInvite(name: string, email: string, role: OrgUser["role"]) {
    await new Promise<void>((resolve, reject) =>
      inviteUser({ name, email, role }, { onSuccess: resolve, onError: reject })
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading users…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users & Roles"
        description="Manage team members and their permissions"
        action={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Invite User
          </Button>
        }
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="mt-6 flex flex-col gap-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Total Users" value={totalUsers} />
            <StatCard title="Active Users" value={activeUsers} />
            <StatCard title="Pending Invites" value={pendingInvites} />
          </div>

          {/* Users table */}
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    {/* User column */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${(user as { avatarColor: string }).avatarColor}`}
                        >
                          {(user as { avatarInitials: string }).avatarInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {user.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Role column — inline Select */}
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(v) => {
                          // Resolve custom role id → baseRole before saving
                          const cr = customRoles.find((r) => r.id === v);
                          handleRoleChange(user.id, (cr ? cr.baseRole : v) as OrgUser["role"]);
                        }}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue>{ROLE_LABELS[user.role]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectLabel>System Roles</SelectLabel>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="purchaser">Purchaser</SelectItem>
                          <SelectItem value="technician">Technician</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="requestor">Requestor</SelectItem>
                          {customRoles.length > 0 && (
                            <>
                              <SelectSeparator />
                              <SelectLabel>Custom Roles</SelectLabel>
                              {customRoles.map((cr) => (
                                <SelectItem key={cr.id} value={cr.id}>
                                  {cr.name}
                                  <span className="ml-1.5 text-xs text-slate-400">({cr.baseRole})</span>
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Status badge */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full text-xs font-medium px-2.5 py-0.5 ${statusBadgeClass(user.status)}`}
                      >
                        {statusLabel(user.status)}
                      </Badge>
                    </TableCell>

                    {/* Joined date */}
                    <TableCell className="text-sm text-slate-500">
                      {formatDate((user as { joinedAt: string }).joinedAt)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      {user.status !== "inactive" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-500"
                          onClick={() => handleDeactivate(user.id)}
                          aria-label={`Deactivate ${user.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Roles tab */}
        <TabsContent value="roles" className="mt-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-500">System-defined roles cannot be edited. Create a custom role to tailor permissions for your team.</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCustomRoleOpen(true)}>
                <Plus className="h-4 w-4" />
                New Custom Role
              </Button>
            </div>
            {ROLES.map((role) => (
              <div key={role.key} className="rounded-lg border bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-semibold text-slate-900">{role.name}</h3>
                  <Badge variant="outline" className="font-mono text-xs">
                    {role.key}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600 mb-3">{role.description}</p>
                <ul className="space-y-1">
                  {role.permissions.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 shrink-0 text-brand-500 mt-0.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {customRoles.map((role) => (
              <div key={role.id} className="rounded-lg border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-slate-900">{role.name}</h3>
                    <Badge variant="outline" className="font-mono text-xs">custom</Badge>
                    <Badge variant="outline" className="text-xs text-slate-500">based on {role.baseRole}</Badge>
                  </div>
                  <button
                    onClick={() => setCustomRoles(prev => prev.filter(r => r.id !== role.id))}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-slate-600 mb-3">{role.description || "No description provided."}</p>
                <ul className="space-y-1">
                  {role.permissions.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 shrink-0 text-brand-500 mt-0.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={handleInvite}
        submitting={inviting}
        customRoles={customRoles}
      />

      <Dialog open={customRoleOpen} onOpenChange={setCustomRoleOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>New Custom Role</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-name">Role Name <span className="text-red-500">*</span></Label>
              <Input id="role-name" placeholder="e.g. Field Supervisor" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-desc">Description</Label>
              <Textarea id="role-desc" placeholder="Describe what this role can do" rows={2} value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-base">Based On <span className="text-red-500">*</span></Label>
              <Select
                value={newRoleBase}
                onValueChange={(v) => {
                  const base = v as CustomRole["baseRole"];
                  setNewRoleBase(base);
                  const basePerms = ROLES.find((r) => r.key === base)?.permissions ?? [];
                  setSelectedPermissions(new Set(basePerms));
                }}
              >
                <SelectTrigger id="role-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="purchaser">Purchaser</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="requestor">Requestor</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">The custom role inherits all permissions from the selected base role.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Permissions</Label>
              <p className="text-xs text-slate-500">Check or uncheck individual permissions. Selecting a base role above pre-fills these.</p>
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                {ALL_PERMISSIONS.map((perm) => (
                  <label key={perm} className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedPermissions.has(perm)}
                      onCheckedChange={(checked) => {
                        setSelectedPermissions((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(perm); else next.delete(perm);
                          return next;
                        });
                      }}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-sm text-slate-700">{perm}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomRoleOpen(false)}>Cancel</Button>
            <Button
              disabled={!newRoleName.trim()}
              onClick={() => {
                setCustomRoles(prev => [...prev, {
                  id: `custom-${Date.now()}`,
                  name: newRoleName.trim(),
                  description: newRoleDesc.trim(),
                  baseRole: newRoleBase,
                  permissions: Array.from(selectedPermissions),
                }]);
                setNewRoleName("");
                setNewRoleDesc("");
                setNewRoleBase("technician");
                setSelectedPermissions(new Set());
                setCustomRoleOpen(false);
              }}
            >
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
