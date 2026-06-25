"use client";

import { useState } from "react";
import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
} from "@/lib/hooks/use-crm-campaigns";
import type { CRMCampaign, CampaignStatus, NewCampaignFormValues } from "@/types/crm-campaigns";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  Megaphone,
  Plus,
  MoreHorizontal,
  Mail,
  MessageSquare,
  Search,
  Send,
  Pencil,
  Trash2,
  PauseCircle,
  PlayCircle,
  Users,
  BarChart2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  scheduled: "bg-blue-100 text-blue-700",
  sending: "bg-orange-100 text-orange-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-600",
};

const STATUS_TABS: Array<{ key: "all" | CampaignStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];

const SEGMENT_LABELS: Record<string, string> = {
  all_clients: "All Clients",
  active_clients: "Active Clients",
  leads: "Leads",
  past_clients: "Past Clients",
  custom: "Custom",
};

// ── Campaign Dialog ───────────────────────────────────────────────────────────

function CampaignDialog({
  open,
  campaign,
  onClose,
}: {
  open: boolean;
  campaign: CRMCampaign | null;
  onClose: () => void;
}) {
  const { mutateAsync: create, isPending: creating } = useCreateCampaign();
  const { mutateAsync: update, isPending: updating } = useUpdateCampaign();
  const saving = creating || updating;

  const [form, setForm] = useState<NewCampaignFormValues>(() =>
    campaign
      ? {
          name: campaign.name,
          type: campaign.type,
          targetSegment: campaign.targetSegment,
          subject: campaign.subject ?? "",
          body: campaign.body ?? "",
          scheduledAt: campaign.scheduledAt
            ? campaign.scheduledAt.slice(0, 16)
            : null,
        }
      : {
          name: "",
          type: "email",
          targetSegment: "all_clients",
          subject: "",
          body: "",
          scheduledAt: null,
        }
  );

  // Reset form when dialog opens/campaign changes
  const handleOpenChange = (o: boolean) => {
    if (!o) onClose();
    else
      setForm(
        campaign
          ? {
              name: campaign.name,
              type: campaign.type,
              targetSegment: campaign.targetSegment,
              subject: campaign.subject ?? "",
              body: campaign.body ?? "",
              scheduledAt: campaign.scheduledAt
                ? campaign.scheduledAt.slice(0, 16)
                : null,
            }
          : {
              name: "",
              type: "email",
              targetSegment: "all_clients",
              subject: "",
              body: "",
              scheduledAt: null,
            }
      );
  };

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    try {
      if (campaign) {
        await update({ id: campaign.id, updates: form });
        toast.success("Campaign updated");
      } else {
        await create(form);
        toast.success("Campaign created");
      }
      onClose();
    } catch {
      toast.error("Failed to save campaign");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit Campaign" : "New Campaign"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Spring cleanup promo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, type: v as NewCampaignFormValues["type"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="postcard">Postcard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Target Segment</Label>
              <Select
                value={form.targetSegment}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    targetSegment: v as NewCampaignFormValues["targetSegment"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_clients">All Clients</SelectItem>
                  <SelectItem value="active_clients">Active Clients</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="past_clients">Past Clients</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.type === "email" && (
            <div className="space-y-1.5">
              <Label>Subject Line</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                placeholder="Your lawn is ready for spring…"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Message Body</Label>
            <Textarea
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              placeholder="Write your message here…"
              rows={5}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Schedule Send (optional)</Label>
            <Input
              type="datetime-local"
              value={form.scheduledAt ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, scheduledAt: e.target.value || null }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : campaign ? "Save Changes" : "Create Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Campaign Row ──────────────────────────────────────────────────────────────

function CampaignRow({
  campaign,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  campaign: CRMCampaign;
  onEdit: (c: CRMCampaign) => void;
  onDelete: (c: CRMCampaign) => void;
  onStatusChange: (id: string, status: CampaignStatus) => void;
}) {
  const openRate =
    campaign.deliveredCount > 0
      ? Math.round((campaign.openedCount / campaign.deliveredCount) * 100)
      : null;
  const clickRate =
    campaign.openedCount > 0
      ? Math.round((campaign.clickedCount / campaign.openedCount) * 100)
      : null;

  return (
    <tr className="border-b hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
            {campaign.type === "sms" ? (
              <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <Mail className="h-3.5 w-3.5 text-slate-500" />
            )}
          </div>
          <div>
            <p className="font-medium text-sm text-slate-900">{campaign.name}</p>
            {campaign.subject && (
              <p className="text-xs text-slate-400 truncate max-w-[280px]">{campaign.subject}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            STATUS_COLORS[campaign.status]
          )}
        >
          {STATUS_LABELS[campaign.status]}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {SEGMENT_LABELS[campaign.targetSegment] ?? campaign.targetSegment}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {campaign.totalRecipients > 0 ? (
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {campaign.totalRecipients.toLocaleString()}
          </div>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {openRate !== null ? (
          <div className="flex items-center gap-1">
            <BarChart2 className="h-3 w-3" />
            {openRate}%{clickRate !== null && <span className="text-slate-400"> · {clickRate}% CTR</span>}
          </div>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {campaign.scheduledAt
          ? format(new Date(campaign.scheduledAt), "MMM d, yyyy h:mm a")
          : campaign.sentAt
          ? format(new Date(campaign.sentAt), "MMM d, yyyy")
          : "—"}
      </td>
      <td className="px-3 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(campaign)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            {campaign.status === "draft" && (
              <DropdownMenuItem
                onClick={() => onStatusChange(campaign.id, "scheduled")}
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                Mark Scheduled
              </DropdownMenuItem>
            )}
            {campaign.status === "active" && (
              <DropdownMenuItem
                onClick={() => onStatusChange(campaign.id, "paused")}
              >
                <PauseCircle className="mr-2 h-3.5 w-3.5" />
                Pause
              </DropdownMenuItem>
            )}
            {campaign.status === "paused" && (
              <DropdownMenuItem
                onClick={() => onStatusChange(campaign.id, "active")}
              >
                <PlayCircle className="mr-2 h-3.5 w-3.5" />
                Resume
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => onDelete(campaign)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CampaignsList() {
  const [statusTab, setStatusTab] = useState<"all" | CampaignStatus>("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CRMCampaign | null>(null);
  const [deleting, setDeleting] = useState<CRMCampaign | null>(null);

  const { data: campaigns = [] as CRMCampaign[], isLoading } = useCampaigns();
  const { mutateAsync: update } = useUpdateCampaign();
  const { mutateAsync: deleteCampaign, isPending: delPending } = useDeleteCampaign();

  const filtered = campaigns.filter((c: CRMCampaign) => {
    if (statusTab !== "all" && c.status !== statusTab) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleStatusChange(id: string, status: CampaignStatus) {
    try {
      await update({ id, updates: { status } });
      toast.success("Campaign updated");
    } catch {
      toast.error("Failed to update campaign");
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteCampaign(deleting.id);
      toast.success("Campaign deleted");
      setDeleting(null);
    } catch {
      toast.error("Failed to delete campaign");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Sales Campaigns"
        description="Send targeted email and SMS campaigns to clients and leads."
        action={
          <Button
            size="sm"
            onClick={() => { setEditing(null); setDialogOpen(true); }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Campaign
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b bg-white px-4 py-2 shrink-0">
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((t) => {
            const count =
              t.key === "all"
                ? campaigns.length
                : campaigns.filter((c: CRMCampaign) => c.status === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setStatusTab(t.key)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition-colors",
                  statusTab === t.key
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                )}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                      statusTab === t.key
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-600"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns…"
              className="h-7 w-52 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Create a campaign to send targeted emails or SMS messages to your clients and leads."
            action={
              <Button
                size="sm"
                onClick={() => { setEditing(null); setDialogOpen(true); }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Campaign
              </Button>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b bg-slate-50">
              <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 text-left">Campaign</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">Segment</th>
                <th className="px-3 py-2.5 text-left">Recipients</th>
                <th className="px-3 py-2.5 text-left">Performance</th>
                <th className="px-3 py-2.5 text-left">Scheduled / Sent</th>
                <th className="px-3 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: CRMCampaign) => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  onEdit={(camp) => { setEditing(camp); setDialogOpen(true); }}
                  onDelete={setDeleting}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CampaignDialog
        open={dialogOpen}
        campaign={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleting?.name}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={delPending}
            >
              {delPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
