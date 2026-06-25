"use client";

import { useState } from "react";
import { useUpdateForm } from "@/lib/hooks/use-crm-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Mail } from "lucide-react";
import type { CRMForm, AccountMatchingStrategy, AccountUpdateStrategy } from "@/types/crm-forms";

interface EmailNotification {
  _key: string;
  type: "custom";
  recipients: string; // comma-separated emails or "account"
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  sendCopy: boolean;
}

interface Props {
  form: CRMForm;
}

type ConfirmationType = "message" | "url";

export function FormConfigure({ form }: Props) {
  const updateForm = useUpdateForm(form.id);

  // ── Confirmation ──────────────────────────────────────────────────────────────
  const [confirmType, setConfirmType] = useState<ConfirmationType>(
    (form.settings.confirmationType as ConfirmationType) ?? "message"
  );
  const [confirmMessage, setConfirmMessage] = useState<string>(
    (form.settings.confirmationMessage as string) ??
      "Thank you! Your response has been submitted. We'll be in touch shortly."
  );
  const [confirmUrl, setConfirmUrl] = useState<string>(
    (form.settings.confirmationUrl as string) ?? ""
  );

  // ── Email Notifications ───────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<EmailNotification[]>(() => {
    const saved = form.settings.emailNotifications as EmailNotification[] | undefined;
    return (saved ?? []).map((n, i) => ({ ...n, _key: String(i) }));
  });

  function addNotification() {
    setNotifications((prev) => [
      ...prev,
      {
        _key: `n-${Date.now()}`,
        type: "custom",
        recipients: "",
        fromName: "",
        fromEmail: "",
        subject: `New submission: ${form.name}`,
        body: "A new form response has been submitted.",
        sendCopy: false,
      },
    ]);
  }

  function updateNotification(key: string, patch: Partial<EmailNotification>) {
    setNotifications((prev) => prev.map((n) => n._key === key ? { ...n, ...patch } : n));
  }

  function removeNotification(key: string) {
    setNotifications((prev) => prev.filter((n) => n._key !== key));
  }

  // ── Account Management ────────────────────────────────────────────────────────
  const [autoManage, setAutoManage] = useState(form.autoManageAccounts ?? false);
  const [updateStrategy, setUpdateStrategy] = useState<AccountUpdateStrategy>(
    form.accountUpdateStrategy ?? "add_new"
  );
  const [matchingStrategy, setMatchingStrategy] = useState<AccountMatchingStrategy>(
    form.accountMatchingStrategy ?? "email"
  );

  // ── Tag Settings ──────────────────────────────────────────────────────────────
  const savedTagsOnSubmit = form.settings.tagsOnSubmit as { add?: string[]; remove?: string[] } | undefined;
  const [tagsAdd, setTagsAdd] = useState<string>((savedTagsOnSubmit?.add ?? []).join(", "));
  const [tagsRemove, setTagsRemove] = useState<string>((savedTagsOnSubmit?.remove ?? []).join(", "));

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const tagsAddList = tagsAdd.split(",").map((t) => t.trim()).filter(Boolean);
      const tagsRemoveList = tagsRemove.split(",").map((t) => t.trim()).filter(Boolean);

      await updateForm.mutateAsync({
        settings: {
          ...form.settings,
          confirmationType: confirmType,
          confirmationMessage: confirmType === "message" ? confirmMessage : null,
          confirmationUrl: confirmType === "url" ? confirmUrl : null,
          emailNotifications: notifications.map(({ _key: _, ...n }) => n),
          tagsOnSubmit: {
            add: tagsAddList,
            remove: tagsRemoveList,
          },
        },
        autoManageAccounts: autoManage,
        accountUpdateStrategy: updateStrategy,
        accountMatchingStrategy: matchingStrategy,
      });
      toast.success("Configuration saved");
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* ── Confirmation ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Confirmation</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            What happens after a user submits this form
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-700">Response type</Label>
          <div className="flex gap-3">
            {([
              { value: "message", label: "Simple Message" },
              { value: "url",     label: "Redirect to URL" },
            ] as { value: ConfirmationType; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setConfirmType(value)}
                className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors ${
                  confirmType === value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {confirmType === "message" ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Confirmation message</Label>
            <textarea
              value={confirmMessage}
              onChange={(e) => setConfirmMessage(e.target.value)}
              rows={3}
              placeholder="Thank you! Your response has been submitted."
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Redirect URL</Label>
            <Input
              value={confirmUrl}
              onChange={(e) => setConfirmUrl(e.target.value)}
              placeholder="https://example.com/thank-you"
              className="h-9 text-sm"
            />
          </div>
        )}
      </section>

      {/* ── Email Notifications ──────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Email Notifications</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Send an email when this form is submitted
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={addNotification}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Notification
          </Button>
        </div>

        {notifications.length === 0 && (
          <div className="rounded-md border border-dashed bg-slate-50 py-6 text-center text-xs text-slate-400">
            No notifications configured
          </div>
        )}

        {notifications.map((n, idx) => (
          <div key={n._key} className="rounded-md border bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">
                  Notification #{idx + 1}
                </span>
              </div>
              <button onClick={() => removeNotification(n._key)} className="text-slate-400 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-slate-400">From Name</Label>
                <Input
                  value={n.fromName}
                  onChange={(e) => updateNotification(n._key, { fromName: e.target.value })}
                  placeholder="Twins Lawn Service"
                  className="mt-1 h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-slate-400">From Email</Label>
                <Input
                  value={n.fromEmail}
                  onChange={(e) => updateNotification(n._key, { fromEmail: e.target.value })}
                  placeholder="noreply@yourdomain.com"
                  className="mt-1 h-7 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wide text-slate-400">
                Recipients (emails, roles, or &ldquo;account&rdquo; for the submitter)
              </Label>
              <Input
                value={n.recipients}
                onChange={(e) => updateNotification(n._key, { recipients: e.target.value })}
                placeholder="admin@company.com, account"
                className="mt-1 h-7 text-xs"
              />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wide text-slate-400">Subject</Label>
              <Input
                value={n.subject}
                onChange={(e) => updateNotification(n._key, { subject: e.target.value })}
                className="mt-1 h-7 text-xs"
              />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wide text-slate-400">Body</Label>
              <textarea
                value={n.body}
                onChange={(e) => updateNotification(n._key, { body: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={n.sendCopy}
                onCheckedChange={(v) => updateNotification(n._key, { sendCopy: v })}
              />
              <Label className="text-xs text-slate-600">Include a copy of the form response</Label>
            </div>

            <p className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1">
              Email sending requires SMTP/Resend configuration — notification settings are saved now and will fire once email is wired up.
            </p>
          </div>
        ))}
      </section>

      {/* ── Account Management ────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Account Management</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            How client records are created or updated when this form is submitted
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Automatically Manage Accounts</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {autoManage
                ? "Accounts will be automatically created or updated on submission"
                : "You will manually review each submission in Form Responses"}
            </p>
          </div>
          <Switch checked={autoManage} onCheckedChange={setAutoManage} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">Update Options</Label>
          <p className="text-[11px] text-slate-400">
            When a form is submitted by an existing account, how should it be updated?
          </p>
          <Select value={updateStrategy} onValueChange={(v) => setUpdateStrategy(v as AccountUpdateStrategy)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="replace_all">Replace all existing fields and add new fields</SelectItem>
              <SelectItem value="add_new">Do not replace fields; only add new fields</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">Account Matching</Label>
          <p className="text-[11px] text-slate-400">
            When should a response be matched to an existing account?
          </p>
          <Select value={matchingStrategy} onValueChange={(v) => setMatchingStrategy(v as AccountMatchingStrategy)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email address matches</SelectItem>
              <SelectItem value="name_and_email">First OR last name AND email matches</SelectItem>
              <SelectItem value="name_email_and_company">
                First OR last name AND email AND company name matches
              </SelectItem>
              <SelectItem value="custom">Other (custom criteria)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* ── Tag Settings ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Tag Settings</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Automatically add or remove client tags when this form is submitted
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">Tags on Submit — Add</Label>
          <p className="text-[11px] text-slate-400">
            Tags to add to the client account when the form is submitted (comma-separated)
          </p>
          <Input
            value={tagsAdd}
            onChange={(e) => setTagsAdd(e.target.value)}
            placeholder="estimate-requested, spring-cleanup, vip"
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-700">Tags on Submit — Remove</Label>
          <p className="text-[11px] text-slate-400">
            Tags to remove from the client account when the form is submitted (comma-separated)
          </p>
          <Input
            value={tagsRemove}
            onChange={(e) => setTagsRemove(e.target.value)}
            placeholder="uncontacted, needs-follow-up"
            className="h-9 text-sm"
          />
        </div>
      </section>

      <div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Configuration"}
        </Button>
      </div>
    </div>
  );
}
