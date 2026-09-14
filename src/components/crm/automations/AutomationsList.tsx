"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Pencil, Trash2, Plus, Zap, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useAutomations,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
  useCreateSequence,
  useCreateTrigger,
  useCreateEvent,
} from "@/lib/hooks/use-crm-automations";
import type { EventType, TriggerType } from "@/types/crm-automations";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { toast } from "sonner";

interface AutomationTemplate {
  name: string;
  description: string;
  triggerType: TriggerType;
  events: { eventType: EventType; config: Record<string, unknown> }[];
}

const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    name: "New Lead Welcome Email",
    description: "Sends a welcome email as soon as a new lead is created.",
    triggerType: "lead_created",
    events: [
      {
        eventType: "email",
        config: {
          name: "Welcome email",
          from: "default",
          to: ["client_primary"],
          subject: "Thanks for reaching out, [clientfirstname]!",
          body: "<p>Hi [clientfirstname],</p><p>Thanks for your interest in [companyname]. We'll be in touch shortly to follow up.</p>",
          category: "general",
          between_start: "08:00",
          between_end: "18:00",
          send_weekdays_only: false,
          require_approval: false,
        },
      },
    ],
  },
  {
    name: "Estimate Sent Follow-up",
    description: "Waits 2 days after an estimate is sent, then sends a follow-up email if there's been no response.",
    triggerType: "estimate_sent",
    events: [
      { eventType: "wait", config: { days: 2, hours: 0, minutes: 0 } },
      {
        eventType: "email",
        config: {
          name: "Estimate follow-up",
          from: "default",
          to: ["client_primary"],
          subject: "Following up on your estimate #[quotenumber]",
          body: "<p>Hi [clientfirstname],</p><p>Just checking in on the estimate we sent over — let us know if you have any questions!</p>",
          category: "follow_up",
          between_start: "08:00",
          between_end: "18:00",
          send_weekdays_only: true,
          require_approval: false,
        },
      },
    ],
  },
  {
    name: "Invoice Past Due Reminder",
    description: "Sends a payment reminder email when an invoice becomes past due.",
    triggerType: "invoice_past_due",
    events: [
      {
        eventType: "email",
        config: {
          name: "Past due reminder",
          from: "default",
          to: ["client_primary", "billing_email"],
          subject: "Reminder: Your invoice is past due",
          body: "<p>Hi [clientfirstname],</p><p>This is a friendly reminder that your invoice with [companyname] is past due. Please let us know if you have any questions.</p>",
          category: "reminder",
          between_start: "08:00",
          between_end: "18:00",
          send_weekdays_only: false,
          require_approval: false,
        },
      },
    ],
  },
  {
    name: "Form Submitted Thank You",
    description: "Sends a thank-you email whenever a client submits one of your forms.",
    triggerType: "form_submitted",
    events: [
      {
        eventType: "email",
        config: {
          name: "Form thank you",
          from: "default",
          to: ["client_primary"],
          subject: "Thanks for submitting, [clientfirstname]!",
          body: "<p>Hi [clientfirstname],</p><p>Thanks for reaching out through our form — we've received your submission and will follow up soon.</p>",
          category: "general",
          between_start: "08:00",
          between_end: "18:00",
          send_weekdays_only: false,
          require_approval: false,
        },
      },
    ],
  },
];

interface Props {
  newDialogOpen: boolean;
  onNewDialogOpenChange: (open: boolean) => void;
}

export function AutomationsList({ newDialogOpen, onNewDialogOpenChange }: Props) {
  const router = useRouter();
  const { can } = usePermissions();
  const canModify = can("automation_create_modify");
  const canStop = can("automation_stop");
  const { data: automations = [], isLoading } = useAutomations();
  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();
  const createSequence = useCreateSequence();
  const createTrigger = useCreateTrigger();
  const createEvent = useCreateEvent();

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const automation = await createAutomation.mutateAsync({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      onNewDialogOpenChange(false);
      setNewName("");
      setNewDescription("");
      router.push(`/crm/communication/automations/${automation.id}`);
    } catch {
      toast.error("Failed to create automation");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddTemplate(template: AutomationTemplate) {
    setAddingTemplate(template.name);
    try {
      const automation = await createAutomation.mutateAsync({
        name: template.name,
        description: template.description,
      });
      const sequence = await createSequence.mutateAsync({
        automationId: automation.id,
        name: template.name,
      });
      await createTrigger.mutateAsync({
        sequenceId: sequence.id,
        triggerType: template.triggerType,
      });
      for (let i = 0; i < template.events.length; i++) {
        const step = template.events[i];
        await createEvent.mutateAsync({
          sequenceId: sequence.id,
          eventType: step.eventType,
          config: step.config,
          position: i,
        });
      }
      router.push(`/crm/communication/automations/${automation.id}`);
    } catch {
      toast.error("Failed to add automation from template");
    } finally {
      setAddingTemplate(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete automation "${name}"? This cannot be undone.`)) return;
    try {
      await deleteAutomation.mutateAsync(id);
    } catch {
      toast.error("Failed to delete automation");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const templateSection = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-semibold text-slate-700">Start from a template</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {AUTOMATION_TEMPLATES.map((t) => {
          const alreadyAdded = automations.some((a) => a.name === t.name);
          return (
            <div
              key={t.name}
              className="flex flex-col justify-between gap-3 rounded-lg border bg-white p-4 shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                <p className="mt-1 text-xs text-slate-500">{t.description}</p>
              </div>
              {canModify && (
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  disabled={alreadyAdded || addingTemplate === t.name}
                  onClick={() => handleAddTemplate(t)}
                >
                  {alreadyAdded ? "Added" : addingTemplate === t.name ? "Adding…" : "+ Add"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {automations.length === 0 ? (
        <div className="flex flex-col gap-6">
          {templateSection}
          <EmptyState
            icon={Zap}
            title="No automations yet"
            description="Create an automation to build event-driven client sequences, or add one from a template above."
            action={
              canModify ? (
                <Button size="sm" onClick={() => onNewDialogOpenChange(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Automation
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {templateSection}
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => router.push(`/crm/communication/automations/${a.id}`)}
                >
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {a.description ? (
                      <span className="line-clamp-1 max-w-xs">{a.description}</span>
                    ) : (
                      <span className="italic text-slate-300">No description</span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {format(new Date(a.updatedAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={a.isActive}
                        disabled={!canStop}
                        onCheckedChange={(checked) =>
                          updateAutomation.mutate(
                            { id: a.id, updates: { isActive: checked } },
                            { onError: () => toast.error("Failed to update automation") }
                          )
                        }
                      />
                      {a.isActive ? (
                        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">
                          Disabled
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {canModify && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => router.push(`/crm/communication/automations/${a.id}`)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          onClick={() => handleDelete(a.id, a.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </div>
      )}

      <Dialog open={newDialogOpen} onOpenChange={onNewDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Automation</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auto-name">Name</Label>
              <Input
                id="auto-name"
                placeholder="e.g. New client welcome sequence"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auto-desc">Description</Label>
              <Textarea
                id="auto-desc"
                placeholder="Optional description…"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onNewDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
