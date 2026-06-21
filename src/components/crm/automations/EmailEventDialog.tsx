"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import type { CRMSequenceEvent } from "@/types/crm-automations";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

const EMAIL_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "marketing", label: "Marketing" },
  { value: "transactional", label: "Transactional" },
  { value: "follow_up", label: "Follow-up" },
  { value: "reminder", label: "Reminder" },
];

const TO_OPTIONS = [
  { value: "client_primary", label: "Client primary email" },
  { value: "billing_email", label: "Billing email" },
  { value: "all_contacts", label: "All contacts (ok to email)" },
];

export function EmailEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const c = event.config;

  const [name, setName] = useState<string>(c.name ?? "");
  const [from, setFrom] = useState<string>(c.from ?? "default");
  const [to, setTo] = useState<string[]>(c.to ?? ["client_primary"]);
  const [subject, setSubject] = useState<string>(c.subject ?? "");
  const [body, setBody] = useState<string>(c.body ?? "");
  const [category, setCategory] = useState<string>(c.category ?? "general");
  const [betweenStart, setBetweenStart] = useState<string>(c.between_start ?? "08:00");
  const [betweenEnd, setBetweenEnd] = useState<string>(c.between_end ?? "18:00");
  const [weekdaysOnly, setWeekdaysOnly] = useState<boolean>(c.send_weekdays_only ?? false);
  const [requireApproval, setRequireApproval] = useState<boolean>(c.require_approval ?? false);
  const [saving, setSaving] = useState(false);

  function toggleTo(value: string) {
    setTo((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: {
          name,
          from,
          to,
          subject,
          body,
          category,
          between_start: betweenStart,
          between_end: betweenEnd,
          send_weekdays_only: weekdaysOnly,
          require_approval: requireApproval,
        },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Event</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="settings">
          <TabsList className="mb-4">
            <TabsTrigger value="settings">Email Event</TabsTrigger>
            <TabsTrigger value="body">Email Body</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Event Name</Label>
              <Input
                placeholder="e.g. Welcome email"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>From</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default sender</SelectItem>
                  <SelectItem value="sales_rep">Assigned sales rep</SelectItem>
                  <SelectItem value="noreply">No-reply</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>To</Label>
              <div className="flex flex-col gap-2">
                {TO_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`to-${opt.value}`}
                      checked={to.includes(opt.value)}
                      onCheckedChange={() => toggleTo(opt.value)}
                    />
                    <Label htmlFor={`to-${opt.value}`} className="cursor-pointer font-normal">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Subject</Label>
              <Input
                placeholder="Email subject line"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Email Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Send Between</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-36"
                  value={betweenStart}
                  onChange={(e) => setBetweenStart(e.target.value)}
                />
                <span className="text-sm text-slate-500">and</span>
                <Input
                  type="time"
                  className="w-36"
                  value={betweenEnd}
                  onChange={(e) => setBetweenEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="weekdays-only"
                checked={weekdaysOnly}
                onCheckedChange={setWeekdaysOnly}
              />
              <Label htmlFor="weekdays-only" className="cursor-pointer">
                Send Mon–Fri only
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="require-approval"
                checked={requireApproval}
                onCheckedChange={setRequireApproval}
              />
              <Label htmlFor="require-approval" className="cursor-pointer">
                Require approval before sending
              </Label>
            </div>
          </TabsContent>

          <TabsContent value="body">
            <div className="flex flex-col gap-1.5">
              <Label>Email Body</Label>
              <Textarea
                placeholder="Write your email content here…"
                className="min-h-[300px] font-mono text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-[11px] text-slate-400">
                You can use merge tags like {"{{client_name}}"}, {"{{org_name}}"}.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
