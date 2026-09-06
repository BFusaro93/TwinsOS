"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Save, Globe, Palette, Phone, Mail, Ticket, Eye, EyeOff } from "lucide-react";
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
};

export function ClientPortalTab() {
  const [form, setForm] = useState<PortalSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Ticket categories defined in CRM
  const { data: categoryOptions } = useOrgList("ticket_categories");
  const allCategories = (categoryOptions ?? []).map((o) => o.value);

  useEffect(() => {
    fetch("/api/portal/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) setForm({ ...DEFAULTS, ...d.settings });
      })
      .catch(() => {})
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

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/portal/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Portal settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading portal settings…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Branding */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Branding</h2>
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
              <p className="text-xs text-slate-400">Displayed in the portal header and emails</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Accent Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accent_color}
                  onChange={(e) => patch("accent_color", e.target.value)}
                  className="h-9 w-16 cursor-pointer rounded-md border border-slate-200 p-0.5"
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
            <Label>Logo URL</Label>
            <Input
              value={form.logo_url}
              onChange={(e) => patch("logo_url", e.target.value)}
              placeholder="https://cdn.example.com/logo.png"
            />
            <p className="text-xs text-slate-400">Publicly accessible image URL. Recommended: 200×60px PNG or SVG.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Welcome Message</Label>
            <textarea
              value={form.welcome_message}
              onChange={(e) => patch("welcome_message", e.target.value)}
              placeholder="Welcome to your client portal! Here you can view your invoices, services, and estimates."
              rows={2}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
        </div>
      </section>

      {/* Support contact */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Phone className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Support Contact</h2>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-slate-400" /> Support Phone
            </Label>
            <PhoneInput
              value={form.support_phone}
              onChange={(v) => patch("support_phone", v)}
              placeholder="(555) 555-5555"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-slate-400" /> Support Email
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
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Portal Features</h2>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Show Estimates</p>
              <p className="text-xs text-slate-400 mt-0.5">Clients can view open and accepted estimates</p>
            </div>
            <Switch
              checked={form.allow_estimates}
              onCheckedChange={(v) => patch("allow_estimates", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Allow Tickets</p>
              <p className="text-xs text-slate-400 mt-0.5">Clients can submit support tickets from the portal</p>
            </div>
            <Switch
              checked={form.allow_tickets}
              onCheckedChange={(v) => patch("allow_tickets", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Document Library</p>
              <p className="text-xs text-slate-400 mt-0.5">Clients can browse and download shared company documents</p>
            </div>
            <Switch
              checked={form.allow_documents}
              onCheckedChange={(v) => patch("allow_documents", v)}
            />
          </div>
        </div>
      </section>

      {/* Document library */}
      <PortalDocumentLibrary />

      {/* Ticket categories */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <Ticket className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Visible Ticket Categories</h2>
          <span className="ml-auto text-xs text-slate-400">
            {form.portal_ticket_categories.length} of {allCategories.length} visible
          </span>
        </div>
        <div className="p-4">
          {allCategories.length === 0 ? (
            <p className="text-sm text-slate-400">
              No ticket categories defined yet.{" "}
              <a href="/crm/settings?tab=crm" className="text-brand-600 hover:underline">
                Add categories in CRM settings →
              </a>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500 mb-1">
                Choose which categories clients can select when submitting a ticket. Internal-only categories (e.g. "Collections", "Internal Note") should stay hidden.
              </p>
              {allCategories.map((cat) => {
                const visible = form.portal_ticket_categories.includes(cat);
                return (
                  <div
                    key={cat}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer transition ${
                      visible ? "border-brand-200 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                    onClick={() => toggleCategory(cat)}
                  >
                    <div className="flex items-center gap-2">
                      {visible ? (
                        <Eye className="h-4 w-4 text-brand-500" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-slate-300" />
                      )}
                      <span className={`text-sm ${visible ? "text-slate-800 font-medium" : "text-slate-500"}`}>
                        {cat}
                      </span>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 border ${
                      visible
                        ? "bg-brand-100 text-brand-700 border-brand-200"
                        : "bg-slate-100 text-slate-400 border-slate-200"
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
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <Globe className="h-4 w-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700">Client portal is live at:</p>
          <a
            href="/portal/login"
            target="_blank"
            className="text-sm text-brand-600 hover:underline font-mono"
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
