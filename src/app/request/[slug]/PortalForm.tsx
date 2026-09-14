"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TurnstileWidget } from "@/components/shared/TurnstileWidget";
import type { WorkOrderPriority } from "@/types";

const PUBLIC_ENDPOINT = "/api/public/work-requests";

// Unset in most environments — see .env.local.example. When unset, no widget
// renders and no token is required, so existing portals are unaffected.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const PRIORITIES: { value: WorkOrderPriority; label: string; description: string }[] = [
  { value: "low",      label: "Low",      description: "Not urgent, can be scheduled" },
  { value: "medium",   label: "Medium",   description: "Should be addressed soon" },
  { value: "high",     label: "High",     description: "Affecting work, needs prompt attention" },
  { value: "critical", label: "Critical", description: "Equipment down or safety concern" },
];

/**
 * Free-text input with a suggestions dropdown — replaces a native
 * `<input list>` + `<datalist>`, whose browser-native rendering can't be
 * styled or size-constrained (Chrome renders it as a huge full-row list;
 * Safari renders it compactly). Typing anything not in `options` is still
 * allowed; picking a suggestion just fills the field.
 */
function EquipmentAutocomplete({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(value.trim().toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-[220px] w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              // mousedown (not click) fires before the input's blur, so the
              // selection registers before handlePointerDown/onBlur can close
              // the dropdown out from under it.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.name);
                setOpen(false);
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  const map: Record<WorkOrderPriority, string> = {
    low:      "bg-slate-100 text-slate-600",
    medium:   "bg-blue-50 text-blue-700",
    high:     "bg-amber-50 text-amber-700",
    critical: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

interface PortalFormProps {
  orgSlug: string;
  orgName: string;
  brandColor: string;
  portalEnabled: boolean;
  assetTypes?: string[];
  woCategories?: string[];
  /** Real assets/vehicles to suggest in the Equipment/Asset field (name shown, id linked when matched). */
  equipmentOptions?: { id: string; name: string }[];
  /** Where to POST the submission — public/anonymous portal vs. the authenticated internal field route. */
  endpoint?: string;
}

interface SubmitResult {
  requestNumber: string;
  id: string;
  title: string;
  priority: WorkOrderPriority;
  description: string;
}

export function PortalForm({
  orgSlug,
  orgName,
  brandColor,
  portalEnabled,
  woCategories = [],
  equipmentOptions = [],
  endpoint = PUBLIC_ENDPOINT,
}: PortalFormProps) {
  const [name, setName]                     = useState("");
  const [title, setTitle]                   = useState("");
  const [description, setDescription]       = useState("");
  const [priority, setPriority]             = useState<WorkOrderPriority>("medium");
  const [equipment, setEquipment]           = useState("");
  const [repairCategory, setRepairCategory] = useState("");
  const [hasRepairTag, setHasRepairTag]     = useState<"yes" | "no" | "">("");
  const [errors, setErrors]                 = useState<Record<string, string>>({});
  const [isPending, setIsPending]           = useState(false);
  const [submitted, setSubmitted]           = useState<SubmitResult | null>(null);
  const [serverError, setServerError]       = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey]     = useState(0);
  // Set when the widget itself reports it can't produce a token (script
  // blocked, domain not registered, render error) — the server is still the
  // real enforcement point, so it's safe to stop gating submit once the
  // widget has told us it's broken. See TurnstileWidget for details.
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false);

  // Only the anonymous public portal needs bot protection — the internal
  // field-crew endpoint already requires an authenticated session.
  const isAnonymousPortal = endpoint === PUBLIC_ENDPOINT;
  const requiresTurnstileToken = isAnonymousPortal && !!TURNSTILE_SITE_KEY && !turnstileUnavailable;

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim())        e.name        = "Your name is required.";
    if (!title.trim())       e.title       = "A brief summary is required.";
    if (!description.trim()) e.description = "Please describe the issue.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    if (requiresTurnstileToken && !turnstileToken) {
      setServerError("Please complete the verification check before submitting.");
      return;
    }
    setIsPending(true);
    setServerError(null);
    // If the typed equipment name exactly matches a known asset/vehicle,
    // link the real record (asset_id) in addition to the free-text name —
    // the field stays a plain text input so anything not in the list can
    // still be typed freely.
    const matchedEquipment = equipmentOptions.find(
      (o) => o.name.trim().toLowerCase() === equipment.trim().toLowerCase()
    );
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          requestedBy:   name.trim(),
          title:         title.trim(),
          description:   description.trim(),
          priority,
          equipment:      equipment.trim() || undefined,
          assetId:        matchedEquipment?.id,
          repairCategory: repairCategory || undefined,
          hasRepairTag: hasRepairTag === "yes" ? true : hasRepairTag === "no" ? false : undefined,
          turnstileToken,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted({ ...json, title: title.trim(), priority, description: description.trim() });
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setIsPending(false);
      // A Turnstile token is single-use — force a fresh solve on retry.
      setTurnstileToken(null);
      setTurnstileKey((k) => k + 1);
    }
  }

  function resetForm() {
    setName(""); setTitle(""); setDescription("");
    setPriority("medium"); setEquipment(""); setRepairCategory("");
    setHasRepairTag(""); setErrors({});
    setSubmitted(null); setServerError(null);
  }

  // ── Portal disabled ──────────────────────────────────────────────────────────

  if (!portalEnabled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-slate-300" />
          <h1 className="text-xl font-semibold text-slate-700">Portal Unavailable</h1>
          <p className="text-sm text-slate-500">
            The maintenance request portal is currently not accepting submissions. Please
            contact your operations team directly.
          </p>
        </div>
      </div>
    );
  }

  // ── Success screen ───────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${brandColor}20` }}
          >
            <CheckCircle2 className="h-9 w-9" style={{ color: brandColor }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Request Submitted</h1>
            <p className="mt-1 text-sm text-slate-500">
              Your maintenance request has been received. The team will review it shortly.
            </p>
          </div>
          <div className="w-full rounded-lg border bg-white p-4 text-left shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Reference Number</span>
              <span className="font-mono text-sm font-semibold text-slate-900">
                {submitted.requestNumber}
              </span>
            </div>
            <div className="mt-3 border-t pt-3">
              <p className="text-sm font-medium text-slate-900">{submitted.title}</p>
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">{submitted.description}</p>
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="text-xs text-slate-500">Priority</span>
              <PriorityBadge priority={submitted.priority} />
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={resetForm}>
            Submit Another Request
          </Button>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-4">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md"
            style={{ backgroundColor: brandColor }}
          >
            <ClipboardList className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{orgName}</p>
            <p className="text-sm font-semibold text-slate-900">Maintenance Request Portal</p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="px-6 pt-6">
            <h1 className="text-lg font-semibold text-slate-900">Submit a Maintenance Request</h1>
            <p className="mt-1 text-sm text-slate-500">
              Use this form to report equipment issues, repairs, or maintenance needs.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="px-6 pb-6 pt-5">
            <div className="flex flex-col gap-5">

              {/* Your name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-sm font-medium">
                  Your Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g. John Smith"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
                  className={errors.name ? "border-red-400 focus-visible:ring-red-400" : ""}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>

              {/* Issue summary */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title" className="text-sm font-medium">
                  Issue Summary <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Zero-Turn #3 — Deck vibrating badly"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: "" })); }}
                  className={errors.title ? "border-red-400 focus-visible:ring-red-400" : ""}
                />
                {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description" className="text-sm font-medium">
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="Describe the issue — when it started, what you noticed, any error lights or sounds…"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: "" })); }}
                  className={`min-h-[100px] resize-y ${errors.description ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                />
                {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
              </div>

              {/* Equipment + priority */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="equipment" className="text-sm font-medium">
                    Equipment / Asset <span className="text-xs font-normal text-slate-400">(optional)</span>
                  </Label>
                  <EquipmentAutocomplete
                    id="equipment"
                    placeholder="e.g. Toro Z-Master #3, Truck #12"
                    value={equipment}
                    onChange={setEquipment}
                    options={equipmentOptions}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="priority" className="text-sm font-medium">Priority / Urgency</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{p.label}</span>
                            <span className="text-xs text-slate-500">{p.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Repair category */}
              {woCategories.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="repair-category" className="text-sm font-medium">
                    Repair Category <span className="text-xs font-normal text-slate-400">(optional)</span>
                  </Label>
                  <Select value={repairCategory || "none"} onValueChange={(v) => setRepairCategory(v === "none" ? "" : v)}>
                    <SelectTrigger id="repair-category">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {woCategories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Repair tag */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium">
                  Did you put a repair tag on the item?{" "}
                  <span className="text-xs font-normal text-slate-400">(optional)</span>
                </Label>
                <div className="flex gap-3">
                  {(["yes", "no"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setHasRepairTag((prev) => prev === v ? "" : v)}
                      className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors ${
                        hasRepairTag === v
                          ? "border-transparent text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      style={hasRepairTag === v ? { backgroundColor: brandColor } : {}}
                    >
                      {v === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>

              {isAnonymousPortal && TURNSTILE_SITE_KEY && !turnstileUnavailable && (
                <TurnstileWidget
                  key={turnstileKey}
                  siteKey={TURNSTILE_SITE_KEY}
                  onVerify={setTurnstileToken}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileUnavailable(true)}
                />
              )}

              {serverError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{serverError}</p>
              )}

              {/* Submit */}
              <div className="flex justify-end border-t pt-4">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="min-w-[140px]"
                  style={{ backgroundColor: brandColor }}
                >
                  {isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
                  ) : (
                    "Submit Request"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Powered by Equipt · {orgName}
        </p>
      </div>
    </div>
  );
}
