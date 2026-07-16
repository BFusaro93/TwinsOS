"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useEmailTemplates } from "@/lib/hooks/use-email-templates";
import { CHEMICAL_EMAIL_MERGE_TAGS } from "@/types/crm-proposals";

const DEFAULT_TEMPLATE_BODY = `<p>Hi [clientfirstname],</p>

<p>[companyname] applied the following on [applicationdate]:</p>

[products]

<p><strong>Conditions at time of application:</strong> [conditions]</p>
<p><strong>Applicator:</strong> [applicatorname] (License #[applicatorlicense])</p>

<p>[careinstructions]</p>

<p>Keep children and pets off the treated area until dry. If you have any questions, please don't hesitate to reach out.</p>

<p>Thank you,<br>[companyname]<br>[companyphonenumber]</p>`;

const DEFAULT_SUBJECT = "Notice of Treatment from [companyname] — [applicationdate]";

interface Props {
  visitId: string;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

export function SendApplicationNoticeDialog({ visitId, open, onClose, onSent }: Props) {
  const { data: templates = [] } = useEmailTemplates("chemical_application");

  const { data: visitInfo } = useQuery({
    queryKey: ["visit-client-info", visitId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_job_visits")
        .select("clients(display_name, primary_email)")
        .eq("id", visitId)
        .single();
      if (error) throw error;
      return {
        clientName: data.clients?.display_name ?? null,
        clientEmail: data.clients?.primary_email ?? null,
      };
    },
    enabled: open,
  });

  const clientName = visitInfo?.clientName ?? null;
  const clientEmail = visitInfo?.clientEmail ?? null;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject]   = useState(DEFAULT_SUBJECT);
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_TEMPLATE_BODY);
  const [sending, setSending]   = useState(false);
  const [tab, setTab]           = useState<"compose" | "preview">("compose");
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInput, setCcInput]   = useState("");

  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (tpl) { setSubject(tpl.subject); setBodyHtml(tpl.bodyHtml); }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (open && templates.length > 0 && !selectedTemplateId) {
      const def = templates.find((t) => t.isDefault);
      if (def) { setSelectedTemplateId(def.id); setSubject(def.subject); setBodyHtml(def.bodyHtml); }
    }
  }, [open, templates, selectedTemplateId]);

  function previewResolve(text: string) {
    return text
      .replace(/\[clientfirstname\]/gi,   clientName?.split(" ")[0] ?? "Client")
      .replace(/\[clientfullname\]/gi,    clientName ?? "Client")
      .replace(/\[companyname\]/gi,       "Your Company")
      .replace(/\[applicationdate\]/gi,   new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))
      .replace(/\[applicatorname\]/gi,    "Tech Name")
      .replace(/\[applicatorlicense\]/gi, "12345")
      .replace(/\[products\]/gi,          "<ul><li>Sample Product — 12 oz (EPA #12345-67)</li></ul>")
      .replace(/\[conditions\]/gi,        "72°F, Wind 5 mph NW")
      .replace(/\[careinstructions\]/gi,  "Keep children and pets off the treated area until dry.")
      .replace(/\[companyphonenumber\]/gi, "(555) 000-0000");
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function commitCcInput() {
    const trimmed = ccInput.trim().replace(/,+$/, "");
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      toast.error(`"${trimmed}" is not a valid email address`);
      return;
    }
    if (!ccEmails.includes(trimmed)) setCcEmails((prev) => [...prev, trimmed]);
    setCcInput("");
  }

  async function handleSend() {
    if (!clientEmail) {
      toast.error("Client has no email address on file");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/crm/chemical-applications/${visitId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyHtml, ccEmails }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send");
      }
      toast.success(`Notice sent to ${clientEmail}`);
      onSent();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send notice");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Application Notice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3 rounded-md border bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-400 text-xs font-medium w-8">To</span>
            <span className="font-medium text-slate-700">{clientName}</span>
            {clientEmail
              ? <span className="text-slate-400">&lt;{clientEmail}&gt;</span>
              : <Badge variant="destructive" className="text-[10px]">No email on file</Badge>
            }
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm cursor-text min-h-[38px]"
            onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
          >
            <span className="text-slate-400 text-xs font-medium w-8 shrink-0">CC</span>
            {ccEmails.map((email) => (
              <span key={email} className="flex items-center gap-1 bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-xs">
                {email}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCcEmails((prev) => prev.filter((e2) => e2 !== email)); }}
                  className="text-slate-400 hover:text-slate-700 leading-none"
                  aria-label={`Remove ${email}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === "Tab") { e.preventDefault(); commitCcInput(); }
              }}
              onBlur={commitCcInput}
              placeholder={ccEmails.length === 0 ? "Add CC recipients…" : ""}
              className="flex-1 min-w-[160px] text-xs outline-none bg-transparent placeholder:text-slate-400"
            />
          </div>

          {templates.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="w-20 shrink-0 text-xs">Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Label className="w-20 shrink-0 text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 text-xs" />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="h-8">
              <TabsTrigger value="compose" className="text-xs">Compose</TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="compose" className="mt-2">
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={12}
                className="w-full rounded border border-slate-200 p-2 text-xs font-mono focus:border-brand-400 focus:outline-none resize-y"
                placeholder="Email body (HTML supported)…"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CHEMICAL_EMAIL_MERGE_TAGS.map((mt) => (
                  <button
                    key={mt.tag}
                    type="button"
                    title={mt.label}
                    onClick={() => setBodyHtml((b) => b + mt.tag)}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 hover:bg-brand-100 hover:text-brand-700"
                  >
                    {mt.tag}
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-2">
              <div
                className="min-h-[240px] rounded border bg-white p-4 text-sm overflow-auto"
                dangerouslySetInnerHTML={{ __html: previewResolve(bodyHtml) }}
              />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !clientEmail || !subject.trim() || !bodyHtml.trim()}>
            {sending ? "Sending…" : `Send to ${clientEmail ?? "client"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
