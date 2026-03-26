"use client";

import { useState } from "react";
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
import { useCreateRequest } from "@/lib/hooks/use-requests";
import { useSettingsStore } from "@/stores/settings-store";
import type { WorkOrderPriority } from "@/types";

const PRIORITIES: { value: WorkOrderPriority; label: string; description: string }[] = [
  { value: "low",      label: "Low",      description: "Not urgent, can be scheduled" },
  { value: "medium",   label: "Medium",   description: "Should be addressed soon" },
  { value: "high",     label: "High",     description: "Affecting work, needs prompt attention" },
  { value: "critical", label: "Critical", description: "Equipment down or safety concern" },
];

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

export default function RequestPortalPage() {
  const { orgName, logoDataUrl, brandColor, portalEnabled } = useSettingsStore();
  const { mutate: createRequest, isPending, isSuccess, data: submitted } = useCreateRequest();

  const [name, setName]               = useState("");
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority]       = useState<WorkOrderPriority>("medium");
  const [equipment, setEquipment]     = useState("");
  const [errors, setErrors]           = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim())        e.name        = "Your name is required.";
    if (!title.trim())       e.title       = "A brief summary is required.";
    if (!description.trim()) e.description = "Please describe the issue.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    createRequest({
      title:             title.trim(),
      description:       description.trim(),
      priority,
      requestedByName:   name.trim(),
      assetName:         equipment.trim() || undefined,
    });
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

  if (isSuccess && submitted) {
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
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setName("");
              setTitle("");
              setDescription("");
              setPriority("medium");
              setEquipment("");
              setErrors({});
              // Reset by navigating — TanStack Query mutation state resets on next mount
              window.location.reload();
            }}
          >
            Submit Another Request
          </Button>
        </div>
      </div>
    );
  }

  // ── Portal form ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header bar */}
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-4">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt={orgName} className="h-8 max-w-[120px] object-contain" />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{ backgroundColor: brandColor }}
            >
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
          )}
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
              Use this form to report equipment issues, repairs, or maintenance needs. Our team will
              review your request and follow up as needed.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="px-6 pb-6 pt-5">
            <div className="flex flex-col gap-5">

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-sm font-medium">
                  Your Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g. John Smith"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: "" })); }}
                  className={errors.name ? "border-red-400 focus-visible:ring-red-400" : ""}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>

              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title" className="text-sm font-medium">
                  Issue Summary <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Zero-Turn #3 — Deck vibrating badly"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setErrors((prev) => ({ ...prev, title: "" })); }}
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
                  placeholder="Describe the issue in as much detail as possible — when it started, what you noticed, any error lights or sounds…"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setErrors((prev) => ({ ...prev, description: "" })); }}
                  className={`min-h-[100px] resize-y ${errors.description ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                />
                {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
              </div>

              {/* Two-col row: priority + equipment */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="priority" className="text-sm font-medium">Priority</Label>
                  <Select
                    value={priority}
                    onValueChange={(v) => setPriority(v as WorkOrderPriority)}
                  >
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

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="equipment" className="text-sm font-medium">
                    Equipment / Asset{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </Label>
                  <Input
                    id="equipment"
                    placeholder="e.g. Toro Z-Master #3, Truck #12"
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end border-t pt-4">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="min-w-[140px]"
                  style={{ backgroundColor: brandColor }}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    "Submit Request"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Powered by TwinsOS · {orgName}
        </p>
      </div>
    </div>
  );
}
