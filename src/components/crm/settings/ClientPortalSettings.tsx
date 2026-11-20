"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Save, Globe, Palette, Phone, Mail, Ticket, Eye, EyeOff, CreditCard, CalendarDays, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { PortalDocumentLibrary } from "@/components/crm/settings/PortalDocumentLibrary";

interface PortalSettings {
  company_name: string;
  logo_url: string;
  accent_color: string;
  support_email: string;
  support_phone: string;
  allow_tickets: boolean;
  allow_estimates: boolean;
  allow_documents: boolean;
  welcome_message: string;
  portal_ticket_categories: string[];
  email_support_on_new_ticket: boolean;
  allow_autopay: boolean;
  allow_card_management: boolean;
  card_max_payment_cents: number | null;
  ach_max_payment_cents: number | null;
  show_upcoming_services: boolean;
  show_service_history: boolean;
}

/** Max-payment inputs are dollars in the UI, integer cents in the DB. Blank = no limit. */
function centsToDollarInput(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
function dollarInputToCents(value: string): number | null {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

const DEFAULTS: PortalSettings = {
  company_name: "",
  logo_url: "",
  accent_color: "#60ab45",
  support_email: "",
  support_phone: "",
  allow_tickets: true,
  allow_estimates: true,
  allow_documents: true,
  welcome_message: "",
  portal_ticket_categories: [],
  email_support_on_new_ticket: false,
  allow_autopay: true,
  allow_card_management: true,
  card_max_payment_cents: null,
  ach_max_payment_cents: null,
  show_upcoming_services: true,
  show_service_history: true,
};

export function ClientPortalTab() {
  const [form, setForm] = useState<PortalSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  // A failed load left the form on DEFAULTS, and Save then overwrote the real settings.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [cardMax, setCardMax] = useState("");
  const [achMax, setAchMax] = useState("");

  // Ticket categories defined in CRM
  const { data: categoryOptions } = useOrgList("ticket_categories");
  const allCategories = (categoryOptions ?? []).map((o) => o.value);

  useEffect(() => {
    fetch("/api/portal/settings")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { error?: string }).error ?? `HTTP ${r.status}`);
        const loaded = (d as { settings?: Partial<PortalSettings> }).settings;
        if (loaded) {
          setForm({ ...DEFAULTS, ...loaded });
          setCardMax(centsToDollarInput(loaded.card_max_payment_cents));
          setAchMax(centsToDollarInput(loaded.ach_max_payment_cents));
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load portal settings"))
      .finally(() => setLoading(false));
  }, []);

  function patch<K extends keyof PortalSettings>(key: K, value: PortalSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCategory(cat: string) {
    setForm((f) => {
      const current = f.portal_ticket_categories;
      return {
        ...f,
        portal_ticket_categories: current.includes(cat)
          ? current.filter((c) => c !== cat)
          : [...current, cat],
      };
    });
  }

  // Same public bucket + org-folder convention as Settings > Branding; the public URL goes into
  // logo_url like a pasted link would, and is saved with the rest of the form.
  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Logo must be a PNG, JPG, WebP or GIF image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be 2 MB or smaller");
      return;
    }
    setUploadingLogo(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { getStorageOrgPrefix } = await import("@/lib/supabase/storage-org-prefix");
      const supabase = createClient();
      const orgPrefix = await getStorageOrgPrefix(supabase);
      const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${orgPrefix}/logos/portal-logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("thumbnails").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      patch("logo_url", supabase.storage.from("thumbnails").getPublicUrl(path).data.publicUrl);
      toast.success("Logo uploaded — click Save Portal Settings to apply it");
    } catch {
      toast.error("Couldn't upload the logo. Try again, or paste an image URL instead.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function save() {
    for (const [label, value] of [["Card", cardMax], ["ACH", achMax]] as const) {
      if (value.trim() && dollarInputToCents(value) === null) {
        toast.error(`${label} max payment must be a dollar amount greater than 0, or blank for no limit`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/portal/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          card_max_payment_cents: dollarInputToCents(cardMax),
          ach_max_payment_cents: dollarInputToCents(achMax),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = (body as { error?: unknown }).error;
        throw new Error(typeof err === "string" ? err : "Failed to save settings");
      }
      toast.success("Portal settings saved");
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-400 dark:text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading portal settings…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        Couldn&apos;t load the portal settings ({loadError}). Reload the page before making changes — saving now would
        overwrite them with defaults.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Branding */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Branding</h2>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Company Name</Label>
              <Input
                value={form.company_name}
                onChange={(e) => patch("company_name", e.target.value)}
                placeholder="Your Company Name"
              />
              <p className="text-xs text-slate-400 dark:text-neutral-500">Displayed in the portal header and emails</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Accent Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accent_color}
                  onChange={(e) => patch("accent_color", e.target.value)}
                  className="h-9 w-16 cursor-pointer rounded-md border border-border p-0.5"
                />
                <Input
                  value={form.accent_color}
                  onChange={(e) => patch("accent_color", e.target.value)}
                  placeholder="#60ab45"
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {form.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo_url} alt="Portal logo" className="h-10 max-w-[160px] rounded border border-border bg-white object-contain p-1" />
              )}
              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {form.logo_url ? "Replace" : "Upload logo"}
              </Button>
              {form.logo_url && (
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => patch("logo_url", "")}>
                  <X className="h-4 w-4" /> Remove
                </Button>
              )}
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleLogoFile} />
            </div>
            <Input
              value={form.logo_url}
              onChange={(e) => patch("logo_url", e.target.value)}
              placeholder="…or paste an image URL, e.g. https://cdn.example.com/logo.png"
            />
            <p className="text-xs text-slate-400 dark:text-neutral-500">
              PNG, JPG, WebP or GIF up to 2 MB; about 200×60px works best. Leave empty to use your company logo from Settings → Branding.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Welcome Message</Label>
            <textarea
              value={form.welcome_message}
              onChange={(e) => patch("welcome_message", e.target.value)}
              placeholder="Welcome to your client portal! Here you can view your invoices, services, and estimates."
              rows={2}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <p className="text-xs text-slate-400 dark:text-neutral-500">
              Shown under the greeting on the portal Home page. Leave blank to show nothing.
            </p>
          </div>
        </div>
      </section>

      {/* Support contact */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Phone className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Support Contact</h2>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" /> Support Phone
            </Label>
            <PhoneInput
              value={form.support_phone}
              onChange={(v) => patch("support_phone", v)}
              placeholder="(555) 555-5555"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" /> Support Email
            </Label>
            <Input
              value={form.support_email}
              onChange={(e) => patch("support_email", e.target.value)}
              placeholder="office@example.com"
              type="email"
            />
          </div>
        </div>
      </section>

      {/* Feature toggles */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Portal Features</h2>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">Show Estimates</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">Clients can view open and accepted estimates</p>
            </div>
            <Switch
              checked={form.allow_estimates}
              onCheckedChange={(v) => patch("allow_estimates", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">Allow Tickets</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">Clients can submit support tickets from the portal</p>
            </div>
            <Switch
              checked={form.allow_tickets}
              onCheckedChange={(v) => patch("allow_tickets", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">Email Support Email on new tickets</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">
                Also send every new portal ticket to the Support Email above, in addition to the client&apos;s sales rep.
                Without a sales rep it always goes to the Support Email.
              </p>
            </div>
            <Switch
              checked={form.email_support_on_new_ticket}
              onCheckedChange={(v) => patch("email_support_on_new_ticket", v)}
              disabled={!form.support_email.trim()}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">Document Library</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">Clients can browse and download shared company documents</p>
            </div>
            <Switch
              checked={form.allow_documents}
              onCheckedChange={(v) => patch("allow_documents", v)}
            />
          </div>
        </div>
      </section>

      {/* Payments */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Portal Payments</h2>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">Allow Autopay</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">
                Clients can turn autopay on. They can always turn it off, and autopay already set up keeps running.
              </p>
            </div>
            <Switch checked={form.allow_autopay} onCheckedChange={(v) => patch("allow_autopay", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">Allow Clients to Manage Payment Method</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">
                Clients can add, update or remove the card or bank account on file. When off, only your team can change it.
              </p>
            </div>
            <Switch checked={form.allow_card_management} onCheckedChange={(v) => patch("allow_card_management", v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Card Max Payment Amount</Label>
              <Input value={cardMax} onChange={(e) => setCardMax(e.target.value)} placeholder="No limit" inputMode="decimal" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ACH Max Payment Amount</Label>
              <Input value={achMax} onChange={(e) => setAchMax(e.target.value)} placeholder="No limit" inputMode="decimal" />
            </div>
            <p className="col-span-2 text-xs text-slate-400 dark:text-neutral-500 -mt-2">
              The most a client can pay online in one payment (invoice balance or prepayment, before any card fee). Leave blank for no limit.
              Does not apply to autopay or payments your team records.
            </p>
          </div>
        </div>
      </section>

      {/* Services visibility */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Portal Services</h2>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">View Upcoming Services</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">Clients can see their scheduled visits</p>
            </div>
            <Switch checked={form.show_upcoming_services} onCheckedChange={(v) => patch("show_upcoming_services", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">View Service History</p>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">Clients can see their completed visits</p>
            </div>
            <Switch checked={form.show_service_history} onCheckedChange={(v) => patch("show_service_history", v)} />
          </div>
        </div>
      </section>

      {/* Document library */}
      <PortalDocumentLibrary />

      {/* Ticket categories */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Ticket className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Visible Ticket Categories</h2>
          <span className="ml-auto text-xs text-slate-400 dark:text-neutral-500">
            {form.portal_ticket_categories.length} of {allCategories.length} visible
          </span>
        </div>
        <div className="p-4">
          {allCategories.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-neutral-500">
              No ticket categories defined yet.{" "}
              <a href="/crm/settings?tab=crm" className="text-brand-600 dark:text-brand-400 hover:underline">
                Add categories in CRM settings →
              </a>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground mb-1">
                Choose which categories clients can select when submitting a ticket. Internal-only categories (e.g. &quot;Collections&quot;, &quot;Internal Note&quot;) should stay hidden.
              </p>
              {allCategories.map((cat) => {
                const visible = form.portal_ticket_categories.includes(cat);
                return (
                  <div
                    key={cat}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer transition ${
                      visible ? "border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/30" : "border-border hover:bg-slate-50 dark:hover:bg-muted/40"
                    }`}
                    onClick={() => toggleCategory(cat)}
                  >
                    <div className="flex items-center gap-2">
                      {visible ? (
                        <Eye className="h-4 w-4 text-brand-500 dark:text-brand-400" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-slate-300 dark:text-neutral-500" />
                      )}
                      <span className={`text-sm ${visible ? "text-slate-800 dark:text-neutral-100 font-medium" : "text-muted-foreground"}`}>
                        {cat}
                      </span>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 border ${
                      visible
                        ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-800"
                        : "bg-muted text-slate-400 dark:text-neutral-500 border-border"
                    }`}>
                      {visible ? "Visible" : "Hidden"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Preview link */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 dark:bg-muted/40 px-4 py-3">
        <Globe className="h-4 w-4 text-slate-400 dark:text-neutral-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 dark:text-neutral-300">Client portal is live at:</p>
          <a
            href="/portal/login"
            target="_blank"
            className="text-sm text-brand-600 dark:text-brand-400 hover:underline font-mono"
          >
            {typeof window !== "undefined" ? window.location.origin : ""}/portal/login
          </a>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Portal Settings
        </Button>
      </div>
    </div>
  );
}
