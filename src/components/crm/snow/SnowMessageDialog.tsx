"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/crm/services/RichTextEditor";
import {
  emailProblem,
  groupVisitsByClient,
  snowContextForStops,
  useSnowClients,
  type SnowClientRow,
} from "@/components/crm/snow/snow-message-shared";
import {
  useCreateDocumentTemplate,
  useDocumentTemplate,
  useDocumentTemplates,
} from "@/lib/hooks/use-crm-documents";
import { useSmsReadiness, SMS_NOT_READY_MESSAGE } from "@/lib/hooks/use-sms-readiness";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { renderBlocksToHtml, renderBlocksToPlainText } from "@/lib/utils/document-template-renderer";
import { resolveSnowTags } from "@/lib/snow/message-tags";
import { smsSegmentInfo } from "@/lib/sms/segments";
import { escapeHtml } from "@/lib/utils/escape-html";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { SNOW_TAGS } from "@/types/crm-documents";
import type { CRMJobVisit, StormEvent } from "@/types/crm-jobs";

export type SnowMessageChannel = "email" | "sms";

/** Twilio's hard ceiling per message; the send route rejects anything longer. */
const MAX_SMS_LENGTH = 1600;
// Same throttle the other bulk sends use: 5 concurrent then a short pause keeps
// us under Resend's default 2 req/sec.
const EMAIL_CONCURRENCY = 5;
const EMAIL_BATCH_DELAY_MS = 800;
const SMS_CONCURRENCY = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Merge tags offered as chips: the snow ones plus the two name tags the send routes resolve. */
const TAG_CHIPS = [
  { tag: "[clientfirstname]", label: "Client's first name" },
  { tag: "[companyname]", label: "Your company name" },
  ...SNOW_TAGS.map((t) => ({ tag: t.tag, label: t.label })),
];

type Failure = { id: string; name: string; error: string };

function visibleText(html: string): string {
  return html.replace(/<(img|hr)\b[^>]*>/gi, "x").replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ").trim();
}

/**
 * Compose + confirm + send for the snow board's "Email clients…" / "Text
 * clients…". One message per client (several stops for one client are folded
 * into one), and every send goes through the existing per-client routes —
 * /send-email (purpose "service", so a Do Not Market client still gets a
 * storm notice, but a bounced address never does) and /send-sms (which
 * re-checks SMS opt-in and STOP replies server-side) — so permission gates,
 * org checks and the client-timeline entry are the same as every other send.
 *
 * The sender can edit freely: a saved snow template (Documents → "Snow –
 * Email" / "Snow – Text Message") only pre-fills the fields. Snow tags are
 * filled per recipient HERE (the board already has the storm/stop data); the
 * routes fill the remaining client/company tags.
 */
export function SnowMessageDialog({
  open,
  onClose,
  initialChannel,
  visits,
  event,
  crewNameOf,
}: {
  open: boolean;
  onClose: () => void;
  initialChannel: SnowMessageChannel;
  visits: CRMJobVisit[];
  event: StormEvent | null;
  crewNameOf: (v: CRMJobVisit) => string | null;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEmail = can("email_activity_send");
  const canSms = can("sms_send");

  const [useEmail, setUseEmail] = useState(initialChannel === "email");
  const [useSms, setUseSms] = useState(initialChannel === "sms");
  const [step, setStep] = useState<"compose" | "confirm">("compose");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [previewId, setPreviewId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [sentEmail, setSentEmail] = useState<Set<string>>(new Set());
  const [sentSms, setSentSms] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<(Failure & { channel: SnowMessageChannel })[]>([]);
  const [saveName, setSaveName] = useState("");
  const richTextRef = useRef<RichTextEditorHandle>(null);
  const smsRef = useRef<HTMLTextAreaElement>(null);

  // Reset whenever the dialog is (re)opened from a different entry point.
  useEffect(() => {
    if (!open) return;
    setUseEmail(initialChannel === "email" && canEmail);
    setUseSms(initialChannel === "sms" && canSms);
    setStep("compose");
    setSentEmail(new Set());
    setSentSms(new Set());
    setFailures([]);
    setSaveName("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialChannel]);

  // ── templates ──────────────────────────────────────────────────────────────
  const { data: allTemplates = [] } = useDocumentTemplates();
  const emailTemplates = useMemo(() => allTemplates.filter((t) => t.docType === "snow_email" && t.status === "active"), [allTemplates]);
  const smsTemplates = useMemo(() => allTemplates.filter((t) => t.docType === "snow_text" && t.status === "active"), [allTemplates]);
  const [emailTemplateId, setEmailTemplateId] = useState("");
  const [smsTemplateId, setSmsTemplateId] = useState("");
  const { data: emailTemplate } = useDocumentTemplate(emailTemplateId);
  const { data: smsTemplate } = useDocumentTemplate(smsTemplateId);
  const createTemplate = useCreateDocumentTemplate();

  // A template only PRE-FILLS; merge tags stay unresolved so each recipient gets their own values.
  useEffect(() => {
    if (!emailTemplate) return;
    if (emailTemplate.subject) setSubject(emailTemplate.subject);
    setBodyHtml(renderBlocksToHtml(emailTemplate.blocks, {}, { preserveUnresolvedKnownTags: true }));
  }, [emailTemplate]);
  useEffect(() => {
    if (!smsTemplate) return;
    setSmsBody(renderBlocksToPlainText(smsTemplate.blocks));
  }, [smsTemplate]);

  // ── recipients ─────────────────────────────────────────────────────────────
  const groups = useMemo(() => groupVisitsByClient(visits), [visits]);
  const { data: clients, isLoading, isError } = useSnowClients(groups.map((g) => g.clientId), open);
  const clientById = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c] as const)), [clients]);
  const { data: smsReady } = useSmsReadiness(open && useSms);

  const snowValuesByClient = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const g of groups) m.set(g.clientId, snowContextForStops(g.visits, event, crewNameOf));
    return m;
  }, [groups, event, crewNameOf]);

  const plan = useMemo(() => {
    const rows = groups.map((g) => ({ g, client: clientById.get(g.clientId) })).filter((r): r is { g: typeof r.g; client: SnowClientRow } => !!r.client);
    const emailOk: SnowClientRow[] = [];
    const noEmail: SnowClientRow[] = [];
    const bounced: SnowClientRow[] = [];
    const sharedEmail: SnowClientRow[] = [];
    const seenEmail = new Set<string>();
    const smsOk: SnowClientRow[] = [];
    const noPhone: SnowClientRow[] = [];
    const notOptedIn: SnowClientRow[] = [];
    const sharedPhone: SnowClientRow[] = [];
    const seenPhone = new Set<string>();
    for (const { client } of rows) {
      const ep = emailProblem(client);
      if (ep === "missing") noEmail.push(client);
      else if (ep === "bounced") bounced.push(client);
      else {
        // One copy per address: accounts sharing a mailbox (second property, a property manager) get one.
        const key = client.email!.toLowerCase();
        if (seenEmail.has(key)) sharedEmail.push(client);
        else { seenEmail.add(key); emailOk.push(client); }
      }
      if (!client.phone) noPhone.push(client);
      else if (!client.smsOptIn) notOptedIn.push(client);
      else {
        const key = client.phone.replace(/\D/g, "").slice(-10);
        if (seenPhone.has(key)) sharedPhone.push(client);
        else { seenPhone.add(key); smsOk.push(client); }
      }
    }
    return { rows, emailOk, noEmail, bounced, sharedEmail, smsOk, noPhone, notOptedIn, sharedPhone };
  }, [groups, clientById]);

  const emailTargets = useEmail ? plan.emailOk.filter((c) => !sentEmail.has(c.id)) : [];
  const smsTargets = useSms ? plan.smsOk.filter((c) => !sentSms.has(c.id)) : [];

  // ── preview (one recipient) ────────────────────────────────────────────────
  const previewCandidates = useMemo(() => {
    const ids = new Set<string>([...(useEmail ? plan.emailOk : []), ...(useSms ? plan.smsOk : [])].map((c) => c.id));
    return plan.rows.map((r) => r.client).filter((c) => ids.has(c.id));
  }, [plan, useEmail, useSms]);
  const previewClient = previewCandidates.find((c) => c.id === previewId) ?? previewCandidates[0] ?? null;

  /** Snow tags + the name tags, for ON-SCREEN preview only (the routes resolve the rest when sending). */
  function previewValues(c: SnowClientRow): Record<string, string> {
    const first = c.firstName?.trim() || c.displayName.split(/\s+/)[0] || "";
    return {
      ...(snowValuesByClient.get(c.id) ?? {}),
      "[clientfirstname]": first,
      "[clientfullname]": c.displayName,
      "[clientname]": c.displayName,
    };
  }
  const previewSubject = previewClient ? resolveSnowTags(subject, previewValues(previewClient)) : subject;
  const previewBodyHtml = previewClient ? resolveSnowTags(bodyHtml, previewValues(previewClient), escapeHtml) : bodyHtml;
  const previewSms = previewClient ? resolveSnowTags(smsBody, previewValues(previewClient)) : smsBody;
  const smsInfo = smsSegmentInfo(previewSms);

  // ── actions ────────────────────────────────────────────────────────────────
  function insertSmsTag(tag: string) {
    const el = smsRef.current;
    if (!el) { setSmsBody((b) => b + tag); return; }
    const start = el.selectionStart ?? smsBody.length;
    const end = el.selectionEnd ?? smsBody.length;
    setSmsBody(smsBody.slice(0, start) + tag + smsBody.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); });
  }

  const emailReady = !useEmail || (subject.trim().length > 0 && visibleText(bodyHtml).length > 0);
  const smsReadyToSend = !useSms || (smsBody.trim().length > 0 && previewSms.length <= MAX_SMS_LENGTH);
  const anyChannel = useEmail || useSms;
  const anyTarget = emailTargets.length + smsTargets.length > 0;

  function goConfirm() {
    if (!anyChannel) { toast.error("Choose email, text, or both"); return; }
    if (!emailReady) { toast.error("The email needs a subject and a message"); return; }
    if (!smsReadyToSend) { toast.error(previewSms.length > MAX_SMS_LENGTH ? `The text is too long (${previewSms.length}/${MAX_SMS_LENGTH})` : "The text needs a message"); return; }
    setStep("confirm");
  }

  async function saveAsTemplate(kind: SnowMessageChannel) {
    const name = saveName.trim();
    if (!name) { toast.error("Name the template first"); return; }
    try {
      if (kind === "email") {
        await createTemplate.mutateAsync({
          name, docType: "snow_email", subject,
          blocks: [{ blockType: "paragraph", orderIndex: 0, content: bodyHtml, settings: {} }],
        });
      } else {
        const paragraphs = smsBody.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
        await createTemplate.mutateAsync({
          name, docType: "snow_text",
          blocks: paragraphs.map((p, i) => ({
            blockType: "paragraph" as const, orderIndex: i,
            content: `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`, settings: {},
          })),
        });
      }
      toast.success(`Saved "${name}" — automations can use it too (Documents → Snow templates)`);
      setSaveName("");
    } catch {
      toast.error("Couldn't save the template");
    }
  }

  async function runBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>, pause = 0) {
    const results: PromiseSettledResult<void>[] = [];
    for (let i = 0; i < items.length; i += size) {
      results.push(...await Promise.allSettled(items.slice(i, i + size).map(fn)));
      if (pause && i + size < items.length) await sleep(pause);
    }
    return results;
  }

  async function post(url: string, payload: unknown): Promise<void> {
    // A 429 (provider rate limit) is retried after a short pause rather than reported as a failure.
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) return;
      if (res.status === 429 && attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
      const json = await res.json().catch(() => ({}));
      throw new Error((json as { error?: string }).error ?? "Failed to send");
    }
  }

  async function handleSend() {
    setSending(true);
    const newFailures: (Failure & { channel: SnowMessageChannel })[] = [];
    try {
      if (emailTargets.length > 0) {
        const res = await runBatches(emailTargets, EMAIL_CONCURRENCY, async (c) => {
          const vals = snowValuesByClient.get(c.id) ?? {};
          await post(`/api/crm/clients/${c.id}/send-email`, {
            subject: resolveSnowTags(subject, vals),
            bodyHtml: resolveSnowTags(bodyHtml, vals, escapeHtml),
            // A storm notice about already-contracted work is a SERVICE message: it
            // reaches Do-Not-Market clients and carries no unsubscribe footer, but
            // the route still refuses a bounced address.
            bulk: true,
            purpose: "service",
          });
        }, EMAIL_BATCH_DELAY_MS);
        const ok = new Set<string>();
        emailTargets.forEach((c, i) => {
          const r = res[i];
          if (r.status === "fulfilled") ok.add(c.id);
          else newFailures.push({ id: c.id, name: c.displayName, channel: "email", error: r.reason instanceof Error ? r.reason.message : "Failed to send" });
        });
        if (ok.size > 0) setSentEmail((prev) => new Set([...prev, ...ok]));
      }
      if (smsTargets.length > 0) {
        const res = await runBatches(smsTargets, SMS_CONCURRENCY, async (c) => {
          const vals = snowValuesByClient.get(c.id) ?? {};
          await post(`/api/crm/clients/${c.id}/send-sms`, { body: resolveSnowTags(smsBody, vals) });
        });
        const ok = new Set<string>();
        smsTargets.forEach((c, i) => {
          const r = res[i];
          if (r.status === "fulfilled") ok.add(c.id);
          else newFailures.push({ id: c.id, name: c.displayName, channel: "sms", error: r.reason instanceof Error ? r.reason.message : "Failed to send" });
        });
        if (ok.size > 0) setSentSms((prev) => new Set([...prev, ...ok]));
      }
      setFailures(newFailures);
      const sent = emailTargets.length + smsTargets.length - newFailures.length;
      if (sent > 0) toast.success(`Sent ${sent} message${sent === 1 ? "" : "s"}`);
      if (newFailures.length > 0) toast.error(`${newFailures.length} failed — Retry only re-sends those`);
      [...emailTargets, ...smsTargets].forEach((c) => qc.invalidateQueries({ queryKey: ["clients", c.id, "activity"] }));
      if (newFailures.length === 0) onClose();
    } finally {
      setSending(false);
    }
  }

  const names = (list: SnowClientRow[]) => list.map((c) => c.displayName).join(", ");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === "confirm" ? "Confirm and send" : "Message clients"}</DialogTitle>
          <DialogDescription>
            {groups.length} client{groups.length === 1 ? "" : "s"} on the selected stops — one message each, even with several stops.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading recipients…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">Couldn&apos;t load the selected clients. Close and try again.</p>
        ) : step === "compose" ? (
          <div className="space-y-4 py-1">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={useEmail} disabled={!canEmail} onCheckedChange={(v) => setUseEmail(v === true)} />
                Email{!canEmail && <span className="text-[11px] text-muted-foreground">(no permission)</span>}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={useSms} disabled={!canSms} onCheckedChange={(v) => setUseSms(v === true)} />
                Text message{!canSms && <span className="text-[11px] text-muted-foreground">(no permission)</span>}
              </label>
            </div>

            {useEmail && (
              <section className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold">Email</Label>
                  <Select value={emailTemplateId} onValueChange={setEmailTemplateId}>
                    <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder={emailTemplates.length ? "Start from a template…" : "No email templates yet"} /></SelectTrigger>
                    <SelectContent>
                      {emailTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject…" />
                <RichTextEditor ref={richTextRef} value={bodyHtml} onChange={setBodyHtml} placeholder="Write your message…" minHeight={150} />
                <div className="flex flex-wrap gap-1.5">
                  {TAG_CHIPS.map((mt) => (
                    <button key={mt.tag} type="button" title={mt.label} onClick={() => richTextRef.current?.insertContent(mt.tag)}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-neutral-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-700 dark:hover:text-brand-400">
                      {mt.tag}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Save as template — name…" className="h-8 text-xs" />
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" disabled={createTemplate.isPending || !subject.trim() || !visibleText(bodyHtml)} onClick={() => void saveAsTemplate("email")}>
                    Save email
                  </Button>
                </div>
              </section>
            )}

            {useSms && (
              <section className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold">Text message</Label>
                  <Select value={smsTemplateId} onValueChange={setSmsTemplateId}>
                    <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder={smsTemplates.length ? "Start from a template…" : "No text templates yet"} /></SelectTrigger>
                    <SelectContent>
                      {smsTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {smsReady === false && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{SMS_NOT_READY_MESSAGE}</p>
                )}
                <Textarea ref={smsRef} rows={4} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Write your text…" />
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex flex-wrap gap-1.5">
                    {TAG_CHIPS.map((mt) => (
                      <button key={mt.tag} type="button" title={mt.label} onClick={() => insertSmsTag(mt.tag)}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-neutral-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-700 dark:hover:text-brand-400">
                        {mt.tag}
                      </button>
                    ))}
                  </div>
                  <span className={previewSms.length > MAX_SMS_LENGTH ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                    {previewSms.length}/{MAX_SMS_LENGTH} · {smsInfo.segments} segment{smsInfo.segments === 1 ? "" : "s"} ({smsInfo.encoding})
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Save as template — name…" className="h-8 text-xs" />
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" disabled={createTemplate.isPending || !smsBody.trim()} onClick={() => void saveAsTemplate("sms")}>
                    Save text
                  </Button>
                </div>
              </section>
            )}

            {anyChannel && previewClient && (
              <section className="space-y-2 rounded-md border bg-slate-50 p-3 dark:bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold">Preview</Label>
                  <Select value={previewClient.id} onValueChange={setPreviewId}>
                    <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {previewCandidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {useEmail && (
                  <div className="space-y-1 text-xs">
                    <p><span className="text-muted-foreground">Subject:</span> {previewSubject || <em className="text-muted-foreground">(empty)</em>}</p>
                    <div className="max-h-40 overflow-auto rounded border bg-white p-2 text-slate-800 dark:bg-neutral-900 dark:text-neutral-200" dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewBodyHtml) }} />
                  </div>
                )}
                {useSms && <p className="whitespace-pre-wrap rounded border bg-white p-2 text-xs dark:bg-neutral-900">{previewSms || <em className="text-muted-foreground">(empty)</em>}</p>}
                <p className="text-[11px] text-muted-foreground">Other tags (company phone, address, etc.) fill in when sent.</p>
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-1 text-sm">
            {useEmail && (
              <div className="space-y-1">
                <p className="font-medium">Email — {emailTargets.length} recipient{emailTargets.length === 1 ? "" : "s"}</p>
                {plan.noEmail.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{plan.noEmail.length} skipped (no email on file): {names(plan.noEmail)}</p>}
                {plan.bounced.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{plan.bounced.length} skipped (email bounced): {names(plan.bounced)}</p>}
                {plan.sharedEmail.length > 0 && <p className="text-xs text-muted-foreground">{plan.sharedEmail.length} share an address with another selected client — one copy per address: {names(plan.sharedEmail)}</p>}
                {sentEmail.size > 0 && <p className="text-xs text-green-700 dark:text-green-400">{sentEmail.size} already emailed — they won&apos;t be emailed again.</p>}
                <p className="text-xs text-muted-foreground">Sent as a service notice: clients who opted out of marketing still receive it, with no unsubscribe footer.</p>
              </div>
            )}
            {useSms && (
              <div className="space-y-1">
                <p className="font-medium">Text — {smsTargets.length} recipient{smsTargets.length === 1 ? "" : "s"}</p>
                {plan.noPhone.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{plan.noPhone.length} skipped (no phone on file): {names(plan.noPhone)}</p>}
                {plan.notOptedIn.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{plan.notOptedIn.length} skipped (haven&apos;t opted in to texts): {names(plan.notOptedIn)}</p>}
                {plan.sharedPhone.length > 0 && <p className="text-xs text-muted-foreground">{plan.sharedPhone.length} share a number with another selected client — one text per number: {names(plan.sharedPhone)}</p>}
                {sentSms.size > 0 && <p className="text-xs text-green-700 dark:text-green-400">{sentSms.size} already texted — they won&apos;t be texted again.</p>}
                <p className="text-xs text-muted-foreground">Numbers that replied STOP are skipped automatically when sending.</p>
              </div>
            )}
            {failures.length > 0 && (
              <div className="max-h-32 space-y-0.5 overflow-auto rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                {failures.map((f) => <p key={`${f.channel}-${f.id}`}>{f.name} ({f.channel === "email" ? "email" : "text"}): {f.error}</p>)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Each message is logged on the client&apos;s timeline.</p>
          </div>
        )}

        <DialogFooter>
          {step === "confirm" ? (
            <>
              <Button variant="outline" onClick={() => setStep("compose")} disabled={sending}>Back</Button>
              <Button onClick={() => void handleSend()} disabled={sending || !anyTarget}>
                {sending ? "Sending…" : failures.length > 0 || sentEmail.size + sentSms.size > 0 ? `Retry (${emailTargets.length + smsTargets.length})` : `Send (${emailTargets.length + smsTargets.length})`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={goConfirm} disabled={isLoading || isError || !anyChannel}>Review &amp; send</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
