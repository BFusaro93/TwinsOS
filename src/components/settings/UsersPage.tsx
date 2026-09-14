"use client";

import { useState, useMemo } from "react";
import { useUsers, useInviteUser, useUpdateUserRole, useDeactivateUser, useReactivateUser, useUpdatePhotoModuleAccess, useCreateCrewAccount, useResetPassword } from "@/lib/hooks/use-users";
import { useModuleAccess } from "@/lib/hooks/use-module-access";
import { Switch } from "@/components/ui/switch";
import { useCurrentUserStore } from "@/stores";
import type { OrgUser } from "@/types";
import { Check, Trash2, UserPlus, Users2, Send, RotateCcw, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

// These roles only make sense for orgs with the Equipt (CMMS) module on
// their plan — an org that only subscribes to Landscapt has no purchase
// orders, work orders, or assets for a Purchaser/Technician/Requestor to
// act on, and offering them here just confuses which role to pick.
const CMMS_ONLY_ROLES = new Set<OrgUser["role"]>(["purchaser", "technician", "requestor"]);

const ROLE_LABELS: Record<OrgUser["role"], string> = {
  admin: "Admin",
  manager: "Manager",
  purchaser: "Purchaser",
  technician: "Technician",
  viewer: "Viewer",
  requestor: "Requestor",
  crew: "Crew",
};

// Permission bullets tagged "cmms" or "crm" only show up for orgs whose plan
// includes that module — an untagged bullet is module-agnostic and always shows.
type RolePermission = { text: string; module?: "cmms" | "crm" };

const ROLES: {
  name: string;
  key: string;
  description: string;
  descriptionCmmsOnly?: string;
  descriptionCrmOnly?: string;
  permissions: RolePermission[];
}[] = [
  {
    name: "Admin",
    key: "admin",
    description: "Full access to everything — all modules, all records, settings, and user management.",
    descriptionCmmsOnly: "Full access to everything — all records, settings, and user management.",
    descriptionCrmOnly: "Full access to everything — all records, settings, and user management.",
    permissions: [
      { text: "Manage all users and roles" },
      { text: "Configure organization settings and approval flows" },
      { text: "Create, edit, and delete any record" },
      { text: "Create and submit purchase requisitions", module: "cmms" },
      { text: "Create and send purchase orders", module: "cmms" },
      { text: "Approve any requisition or purchase order", module: "cmms" },
      { text: "Receive goods and update inventory", module: "cmms" },
      { text: "Manage vendor and product catalog records", module: "cmms" },
      { text: "Create and manage work orders and PM schedules", module: "cmms" },
      { text: "View and edit all assets and vehicles", module: "cmms" },
      { text: "Log meter readings and labor on work orders", module: "cmms" },
      { text: "Manage clients, estimates, jobs, and invoices", module: "crm" },
      { text: "Access the dispatch board and scheduling tools", module: "crm" },
      { text: "View all reports and analytics" },
    ],
  },
  {
    name: "Manager",
    key: "manager",
    description: "Full operational access across purchasing and maintenance — everything except organization settings and user management.",
    descriptionCmmsOnly: "Full operational access across purchasing and maintenance — everything except organization settings and user management.",
    descriptionCrmOnly: "Full operational access across clients, jobs, and scheduling — everything except organization settings and user management.",
    permissions: [
      { text: "Create and submit purchase requisitions", module: "cmms" },
      { text: "Create and send purchase orders", module: "cmms" },
      { text: "Approve and reject requisitions and POs within their limit", module: "cmms" },
      { text: "Receive goods and update inventory", module: "cmms" },
      { text: "Manage vendor and product catalog records", module: "cmms" },
      { text: "Create and manage work orders and PM schedules", module: "cmms" },
      { text: "View and edit all assets and vehicles", module: "cmms" },
      { text: "Log meter readings and labor on work orders", module: "cmms" },
      { text: "Manage clients, estimates, jobs, and invoices", module: "crm" },
      { text: "Access the dispatch board and scheduling tools", module: "crm" },
      { text: "View all reports" },
    ],
  },
  {
    name: "Purchaser",
    key: "purchaser",
    description: "Manages the full procurement lifecycle from requisition to receiving.",
    permissions: [
      { text: "Create and submit purchase requisitions" },
      { text: "Create and send purchase orders" },
      { text: "Receive goods and update inventory" },
      { text: "Manage vendor records" },
      { text: "View product catalog" },
      { text: "View work orders (read-only)" },
    ],
  },
  {
    name: "Technician",
    key: "technician",
    description: "Executes maintenance work, creates and manages work orders, and can initiate procurement for parts.",
    permissions: [
      { text: "Create and manage work orders (not limited to assigned)" },
      { text: "Log labor and parts on work orders" },
      { text: "Submit maintenance requests" },
      { text: "Create and submit purchase requisitions for parts" },
      { text: "Create purchase orders for maintenance parts" },
      { text: "View asset and vehicle details" },
      { text: "Log meter readings" },
    ],
  },
  {
    name: "Viewer",
    key: "viewer",
    description: "Read-only access to view records across both modules without making any changes.",
    descriptionCmmsOnly: "Read-only access to view records without making any changes.",
    descriptionCrmOnly: "Read-only access to view records without making any changes.",
    permissions: [
      { text: "View purchase orders, work orders, and assets", module: "cmms" },
      { text: "View clients, estimates, jobs, and invoices", module: "crm" },
      { text: "No create, edit, or delete access" },
      { text: "Cannot approve or reject records" },
    ],
  },
  {
    name: "Requestor",
    key: "requestor",
    description: "Limited access to submit work requests and purchase requisitions only.",
    permissions: [
      { text: "Submit maintenance requests" },
      { text: "Create purchase requisitions (draft only)" },
      { text: "View status of their own submitted records" },
      { text: "Cannot approve, edit, or delete any records" },
      { text: "No access to assets, vendors, or inventory" },
    ],
  },
  {
    name: "Crew",
    key: "crew",
    description: "Field crew account for shared team devices — assigned to a crew (e.g. MAINT1, ENHANCE1) rather than an individual person.",
    permissions: [
      { text: "Submit maintenance requests", module: "cmms" },
      { text: "View Labor Efficiency dashboard" },
      { text: "View Driver Safety Scores dashboard" },
      { text: "Upload photos to job sites (Job Photos)" },
      { text: "No access to purchasing, assets, inventory, or settings" },
    ],
  },
];

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
  showCmmsRoles?: boolean;
}

function InviteUserDialog({ open, onOpenChange, onInvite, submitting = false, showCmmsRoles = true }: InviteUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgUser["role"] | "">("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setRole("");
    setInviteError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !role) return;
    setInviteError(null);
    try {
      await onInvite(name.trim(), email.trim(), role as OrgUser["role"]);
      reset();
      onOpenChange(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite. Please try again.");
    }
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
            <Select value={role} onValueChange={(v) => setRole(v as OrgUser["role"])}>
              <SelectTrigger id="invite-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                {showCmmsRoles && <SelectItem value="purchaser">Purchaser</SelectItem>}
                {showCmmsRoles && <SelectItem value="technician">Technician</SelectItem>}
                <SelectItem value="viewer">Viewer</SelectItem>
                {showCmmsRoles && <SelectItem value="requestor">Requestor</SelectItem>}
                <SelectItem value="crew">Crew</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {inviteError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
              {inviteError}
            </p>
          )}
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
// CreateCrewAccountDialog (inline)
// ---------------------------------------------------------------------------

interface CreateCrewAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateCrewAccountDialog({ open, onOpenChange }: CreateCrewAccountDialogProps) {
  const [teamName, setTeamName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createCrewAccount = useCreateCrewAccount();
  const creating = createCrewAccount.isPending;

  function reset() {
    setTeamName("");
    setCustomEmail("");
    setPassword("");
    setConfirmPassword("");
    setLoginEmail(null);
    setError(null);
  }

  function handleOpenChange(val: boolean) {
    if (!val) reset();
    onOpenChange(val);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!teamName.trim()) { setError("Team name is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    try {
      const data = await createCrewAccount.mutateAsync({
        teamName: teamName.trim(),
        password,
        customEmail: customEmail.trim() || undefined,
      });
      setLoginEmail(data.loginEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create crew account.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Crew Account</DialogTitle>
          <DialogDescription>
            Creates a shared login for a crew team (e.g. MAINT1, ENHANCE1). You can use a real email or leave it blank to auto-generate one. Credentials are shown once after creation.
          </DialogDescription>
        </DialogHeader>

        {loginEmail ? (
          /* Success state — show credentials */
          <div className="flex flex-col gap-4 pt-2">
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
              <p className="mb-2 text-sm font-medium text-brand-900">Crew account created!</p>
              <div className="rounded-md border border-slate-200 bg-white p-3 font-mono text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Login:</span>
                  <span className="select-all text-slate-900">{loginEmail}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-slate-400">Password:</span>
                  <span className="select-all text-slate-900">{password}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-amber-700">
                Save these credentials — the password cannot be retrieved after this dialog is closed.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          /* Creation form */
          <form onSubmit={handleCreate} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="crew-team-name">Team Name</Label>
              <Input
                id="crew-team-name"
                placeholder="e.g. MAINT1"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="crew-email">
                Login Email <span className="text-slate-400 font-normal text-xs">(optional — auto-generated if blank)</span>
              </Label>
              <Input
                id="crew-email"
                type="email"
                placeholder="e.g. maint1tls@outlook.com"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="crew-password">Password</Label>
              <Input
                id="crew-password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="crew-confirm-password">Confirm Password</Label>
              <Input
                id="crew-confirm-password"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create Account"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ResetPasswordDialog (inline)
// ---------------------------------------------------------------------------

interface ResetPasswordDialogProps {
  user: OrgUser | null;
  onOpenChange: (open: boolean) => void;
}

function ResetPasswordDialog({ user, onOpenChange }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resetPassword = useResetPassword();

  function reset() {
    setPassword("");
    setConfirmPassword("");
    setDone(false);
    setError(null);
  }

  function handleOpenChange(val: boolean) {
    if (!val) reset();
    onOpenChange(val);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return;
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    try {
      await resetPassword.mutateAsync({ userId: user.id, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            {user ? `Set a new password for ${user.name} (${user.email}).` : null} This account uses a
            login email that can&apos;t receive email, so it must be reset here rather than by a
            password-reset link.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col gap-4 pt-2">
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
              <p className="mb-2 text-sm font-medium text-brand-900">Password reset!</p>
              <div className="rounded-md border border-slate-200 bg-white p-3 font-mono text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Login:</span>
                  <span className="select-all text-slate-900">{user?.email}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-slate-400">Password:</span>
                  <span className="select-all text-slate-900">{password}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-amber-700">
                Save these credentials — the password cannot be retrieved after this dialog is closed.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-password">New Password</Label>
              <Input
                id="reset-password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-confirm-password">Confirm Password</Label>
              <Input
                id="reset-confirm-password"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={resetPassword.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={resetPassword.isPending}>
                {resetPassword.isPending ? "Resetting…" : "Reset Password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// UsersPage
// ---------------------------------------------------------------------------

export function UsersPage() {
  const { currentUser } = useCurrentUserStore();
  const isAdmin = currentUser.role === "admin";
  const { data: rawUsers = [], isLoading } = useUsers();
  const { mutate: inviteUser, isPending: inviting } = useInviteUser();
  const { mutate: updateRole } = useUpdateUserRole();
  const { mutate: deactivate } = useDeactivateUser();
  const { mutate: reactivate } = useReactivateUser();
  const { mutate: updatePhotoAccess } = useUpdatePhotoModuleAccess();
  const [resendingId, setResendingId] = useState<string | null>(null);
  // Avoid a flash of hidden roles while the org's plan is still loading —
  // only hide Purchaser/Technician/Requestor once we're sure Equipt isn't on it.
  const { allowed: equiptAllowed, isLoading: equiptLoading } = useModuleAccess("equipt");
  const { allowed: landscaptAllowed, isLoading: landscaptLoading } = useModuleAccess("landscapt");
  const showCmmsRoles = equiptLoading || equiptAllowed;
  const showCrmRoles = landscaptLoading || landscaptAllowed;
  const visibleRoleDefs = (showCmmsRoles ? ROLES : ROLES.filter((r) => !CMMS_ONLY_ROLES.has(r.key as OrgUser["role"])))
    .map((role) => ({
      ...role,
      description:
        showCmmsRoles && showCrmRoles
          ? role.description
          : showCmmsRoles
            ? role.descriptionCmmsOnly ?? role.description
            : showCrmRoles
              ? role.descriptionCrmOnly ?? role.description
              : role.description,
      permissions: role.permissions.filter(
        (p) => !p.module || (p.module === "cmms" && showCmmsRoles) || (p.module === "crm" && showCrmRoles)
      ),
    }));

  async function handleResendInvite(user: OrgUser) {
    setResendingId(user.id);
    try {
      await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, name: user.name, role: user.role }),
      }).then(async (res) => {
        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error ?? "Failed to resend invite");
        }
      });
      toast.success(`Invite resent to ${user.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend invite");
    } finally {
      setResendingId(null);
    }
  }

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
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<OrgUser | null>(null);

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
    deactivate(userId, {
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to deactivate user"),
    });
  }

  function handleReactivate(userId: string) {
    reactivate(userId, {
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to reactivate user"),
    });
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
          isAdmin ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setCrewDialogOpen(true)}>
                <Users2 className="mr-1.5 h-4 w-4" />
                Create Crew Account
              </Button>
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Invite User
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="mt-6 flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Total Users" value={totalUsers} />
            <StatCard title="Active Users" value={activeUsers} />
            <StatCard title="Pending Invites" value={pendingInvites} />
          </div>

          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead>Photo Module</TableHead>}
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${(user as { avatarColor: string }).avatarColor}`}
                        >
                          {(user as { avatarInitials: string }).avatarInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
                          <p className="truncate text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      {/* Editable for admins only — role changes are also
                          enforced server-side (RLS + trigger), this just
                          keeps the control from misleadingly appearing
                          editable to non-admins. */}
                      <Select
                        value={user.role}
                        onValueChange={(v) => handleRoleChange(user.id, v as OrgUser["role"])}
                        disabled={!isAdmin}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue>{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          {showCmmsRoles && <SelectItem value="purchaser">Purchaser</SelectItem>}
                          {showCmmsRoles && <SelectItem value="technician">Technician</SelectItem>}
                          <SelectItem value="crew">Crew</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          {showCmmsRoles && <SelectItem value="requestor">Requestor</SelectItem>}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full text-xs font-medium px-2.5 py-0.5 ${statusBadgeClass(user.status)}`}
                      >
                        {statusLabel(user.status)}
                      </Badge>
                    </TableCell>

                    {isAdmin && (
                      <TableCell>
                        {user.role === "admin" || user.role === "crew" ? (
                          <span className="text-xs text-slate-400">Always on</span>
                        ) : user.role === "requestor" ? (
                          <span className="text-xs text-slate-500">N/A</span>
                        ) : (
                          <Switch
                            checked={user.photoModuleAccess}
                            onCheckedChange={(enabled) =>
                              updatePhotoAccess({ userId: user.id, enabled })
                            }
                            aria-label={`Photo module access for ${user.name}`}
                          />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-slate-500">
                      {formatDate((user as { joinedAt: string }).joinedAt)}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1">
                        {user.role === "crew" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-brand-600"
                            onClick={() => setResetPasswordUser(user)}
                            aria-label={`Reset password for ${user.name}`}
                            title="Reset password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                        {user.status === "invited" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-brand-600"
                            onClick={() => handleResendInvite(user)}
                            disabled={resendingId === user.id}
                            aria-label={`Resend invite to ${user.name}`}
                            title="Resend invite email"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {user.status === "inactive" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-brand-600"
                            onClick={() => handleReactivate(user.id)}
                            aria-label={`Reactivate ${user.name}`}
                            title="Reactivate user"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-500"
                            onClick={() => handleDeactivate(user.id)}
                            aria-label={`Deactivate ${user.name}`}
                            title="Deactivate user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
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
            <p className="text-sm text-slate-500">System-defined roles control what each team member can access and do in the platform.</p>
            {visibleRoleDefs.map((role) => (
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
                    <li key={p.text} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 shrink-0 text-brand-500 mt-0.5" />
                      {p.text}
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
        showCmmsRoles={showCmmsRoles}
      />

      <CreateCrewAccountDialog
        open={crewDialogOpen}
        onOpenChange={setCrewDialogOpen}
      />

      <ResetPasswordDialog
        user={resetPasswordUser}
        onOpenChange={(open) => { if (!open) setResetPasswordUser(null); }}
      />
    </div>
  );
}
