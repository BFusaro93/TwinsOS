"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useSendCampaign,
} from "@/lib/hooks/use-crm-campaigns";
import { useClients } from "@/lib/hooks/use-clients";
import { useDocumentTemplates, useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { renderBlocksToHtml, SAMPLE_MERGE_VALUES } from "@/lib/utils/document-template-renderer";
import { CampaignAudiencePicker } from "./CampaignAudiencePicker";
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
  RotateCcw,
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

  const { data: allClients = [] } = useClients();

  const emptyForm: NewCampaignFormValues = {
    name: "",
    type: "email",
    targetSegment: "all_clients",
    subject: "",
    body: "",
    scheduledAt: null,
    audienceClientIds: [],
  };
  const formFromCampaign = (c: CRMCampaign): NewCampaignFormValues => ({
    name: c.name,
    type: c.type,
    targetSegment: c.targetSegment,
    subject: c.subject ?? "",
    body: c.body ?? "",
    scheduledAt: c.scheduledAt ? c.scheduledAt.slice(0, 16) : null,
    audienceClientIds: c.audienceClientIds,
  });

  const [form, setForm] = useState<NewCampaignFormValues>(() =>
    campaign ? formFromCampaign(campaign) : emptyForm
  );

  // Message Body can be typed free-form or loaded from an existing "Marketing"
  // document template — the template's rendered HTML is copied into `form.body`
  // once picked, same as if it had been typed there, so there's nothing extra
  // to persist on the campaign itself.
  const [bodyMode, setBodyMode] = useState<"custom" | "template">("custom");
  const [templateId, setTemplateId] = useState<string>("");
  const { data: allTemplates = [] } = useDocumentTemplates();
  const marketingTemplates = useMemo(
    () => allTemplates.filter((t) => t.docType === "marketing" && t.status === "active"),
    [allTemplates]
  );
  const { data: templateDetail } = useDocumentTemplate(templateId);

  // Radix only calls onOpenChange for user-initiated closes, not when the
  // parent flips `open` true — so re-sync here whenever the dialog opens or
  // the campaign being edited changes, instead of relying on onOpenChange.
  useEffect(() => {
    if (open) {
      setForm(campaign ? formFromCampaign(campaign) : emptyForm);
      setBodyMode("custom");
      setTemplateId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign]);

  // Leave merge tags ([clientfirstname], etc.) unresolved here — the send
  // route resolves them per recipient. Only the preview (below) uses sample
  // values so the user can see what a real send will look like.
  useEffect(() => {
    if (!templateDetail) return;
    const html = renderBlocksToHtml(templateDetail.blocks, {});
    setForm((p) => ({
      ...p,
      body: html,
      subject: p.subject.trim() ? p.subject : (templateDetail.subject ?? p.subject),
    }));
  }, [templateDetail]);

  const handleOpenChange = (o: boolean) => {
    if (!o) onClose();
  };

  const segmentExclusionCount = useMemo(() => {
    if (form.targetSegment === "custom") return 0;
    const inSegment = allClients.filter((c) => {
      if (form.targetSegment === "active_clients") return c.status === "active";
      if (form.targetSegment === "leads") return c.status === "lead";
      if (form.targetSegment === "past_clients") return c.status === "inactive" || c.status === "cancelled";
      return true;
    });
    return inSegment.filter((c) => c.doNotMarket).length;
  }, [allClients, form.targetSegment]);

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

          {form.targetSegment === "custom" ? (
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <CampaignAudiencePicker
                selectedIds={form.audienceClientIds}
                onChange={(ids) => setForm((p) => ({ ...p, audienceClientIds: ids }))}
              />
            </div>
          ) : segmentExclusionCount > 0 ? (
            <p className="rounded bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
              Excludes {segmentExclusionCount} client{segmentExclusionCount !== 1 ? "s" : ""} marked Do Not Market
            </p>
          ) : null}

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
            <div className="flex items-center justify-between">
              <Label>Message Body</Label>
              {form.type === "email" && (
                <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setBodyMode("custom")}
                    className={cn(
                      "rounded px-2 py-1 font-medium transition-colors",
                      bodyMode === "custom" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Write Your Own
                  </button>
                  <button
                    type="button"
                    onClick={() => setBodyMode("template")}
                    className={cn(
                      "rounded px-2 py-1 font-medium transition-colors",
                      bodyMode === "template" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Use a Template
                  </button>
                </div>
              )}
            </div>

            {bodyMode === "template" && form.type === "email" ? (
              <div className="space-y-2">
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder={marketingTemplates.length > 0 ? "Choose a template…" : "No marketing templates yet"} />
                  </SelectTrigger>
                  <SelectContent>
                    {marketingTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {marketingTemplates.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No &ldquo;Marketing&rdquo; templates yet — create one under Settings → Documents, then it&rsquo;ll show up here.
                  </p>
                ) : templateDetail ? (
                  <div className="max-h-56 overflow-y-auto rounded-md border bg-white p-3">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Preview with sample data — the real client&rsquo;s details are used when sent
                    </p>
                    <div dangerouslySetInnerHTML={{ __html: renderBlocksToHtml(templateDetail.blocks, SAMPLE_MERGE_VALUES) }} />
                  </div>
                ) : null}
              </div>
            ) : (
              <Textarea
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                placeholder="Write your message here…"
                rows={5}
              />
            )}
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
  onSend,
}: {
  campaign: CRMCampaign;
  onEdit: (c: CRMCampaign) => void;
  onDelete: (c: CRMCampaign) => void;
  onStatusChange: (id: string, status: CampaignStatus) => void;
  onSend: (c: CRMCampaign) => void;
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
    <tr
      className="cursor-pointer border-b transition-colors hover:bg-slate-50"
      onClick={() => onEdit(campaign)}
    >
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
      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
            {campaign.type === "email" && (campaign.status === "draft" || campaign.status === "scheduled") && (
              <DropdownMenuItem onClick={() => onSend(campaign)}>
                <Send className="mr-2 h-3.5 w-3.5" />
                Send Now
              </DropdownMenuItem>
            )}
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
  const [sending, setSending] = useState<CRMCampaign | null>(null);

  const { data: campaigns = [] as CRMCampaign[], isLoading, refetch: refetchCampaigns } = useCampaigns();
  const { data: allClients = [] } = useClients();
  const { mutateAsync: update } = useUpdateCampaign();
  const { mutateAsync: deleteCampaign, isPending: delPending } = useDeleteCampaign();
  const { mutateAsync: sendCampaign, isPending: sendPending } = useSendCampaign();

  const recipientCount = useMemo(() => {
    if (!sending) return 0;
    const eligible = allClients.filter((c) => !c.doNotMarket && c.primaryEmail);
    if (sending.targetSegment === "custom") {
      const ids = new Set(sending.audienceClientIds);
      return eligible.filter((c) => ids.has(c.id)).length;
    }
    if (sending.targetSegment === "active_clients") return eligible.filter((c) => c.status === "active").length;
    if (sending.targetSegment === "leads") return eligible.filter((c) => c.status === "lead").length;
    if (sending.targetSegment === "past_clients") return eligible.filter((c) => c.status === "inactive" || c.status === "cancelled").length;
    return eligible.length;
  }, [sending, allClients]);

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

  async function handleSend() {
    if (!sending) return;
    try {
      const result = await sendCampaign(sending.id);
      toast.success(`Sent to ${result.delivered} of ${result.totalRecipients} recipients${result.failed > 0 ? ` (${result.failed} failed)` : ""}`);
      setSending(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send campaign");
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Sales Campaigns"
        description={!isLoading ? `${campaigns.length} campaigns` : undefined}
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

      {/* Toolbar — dark actions bar matching Estimates/Invoices */}
      <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchCampaigns()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <div className="ml-1 flex items-center gap-1 overflow-x-auto">
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
                    "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                    statusTab === t.key
                      ? "bg-white text-slate-800"
                      : "text-slate-300 hover:text-white"
                  )}
                >
                  {t.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        statusTab === t.key
                          ? "bg-slate-200 text-slate-700"
                          : "bg-white/20 text-white"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-52 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
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
                  onSend={setSending}
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

      <AlertDialog open={!!sending} onOpenChange={(o) => !o && setSending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send &ldquo;{sending?.name}&rdquo; now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately email {recipientCount} client{recipientCount !== 1 ? "s" : ""}
              {" "}(Do Not Market clients and clients with no email on file are always excluded). This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} disabled={sendPending || recipientCount === 0}>
              {sendPending ? "Sending…" : `Send to ${recipientCount}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
