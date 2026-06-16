"use client";

import { useState } from "react";
import { useCurrentUserStore } from "@/stores/current-user-store";
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
import { Wrench, CheckCircle2 } from "lucide-react";

const EQUIPMENT_TYPES = [
  "Truck / Vehicle",
  "Mower",
  "Trailer",
  "Hand Tool / Power Tool",
  "Irrigation / Sprinkler",
  "Other Equipment",
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low — not urgent, can wait" },
  { value: "medium", label: "Medium — needs attention soon" },
  { value: "high", label: "High — affecting daily work" },
  { value: "critical", label: "Critical — equipment down, work stopped" },
];

export default function RepairRequestPage() {
  const { currentUser } = useCurrentUserStore();

  const [title, setTitle] = useState("");
  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [hasRepairTag, setHasRepairTag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedNumber, setSubmittedNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isValid = title.trim() && equipmentName.trim() && description.trim() && priority;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/field/repair-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          equipmentName: equipmentName.trim(),
          equipmentType: equipmentType || null,
          location: location.trim() || null,
          description: description.trim(),
          priority,
          hasRepairTag,
          requestedByName: currentUser.name,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Submission failed");
      }

      const data = await res.json();
      setSubmittedNumber(data.requestNumber ?? "");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setTitle("");
    setEquipmentName("");
    setEquipmentType("");
    setLocation("");
    setDescription("");
    setPriority("medium");
    setHasRepairTag(false);
    setError(null);
    setSubmitted(false);
    setSubmittedNumber("");
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <CheckCircle2 className="h-14 w-14 text-green-500" />
        <h2 className="text-2xl font-semibold">Request Submitted</h2>
        {submittedNumber && (
          <p className="text-sm font-mono bg-muted px-3 py-1 rounded">{submittedNumber}</p>
        )}
        <p className="text-muted-foreground max-w-sm">
          Your repair request has been submitted. The maintenance team will review it and create a
          work order.
        </p>
        <Button variant="outline" onClick={handleReset}>
          Submit Another Request
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Repair Request</h1>
          <p className="text-sm text-muted-foreground">Report a broken or malfunctioning piece of equipment</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Submitting as */}
        <div className="space-y-1.5">
          <Label>Submitting as</Label>
          <Input value={currentUser.name} disabled className="bg-muted/50" />
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="title">Issue summary <span className="text-destructive">*</span></Label>
          <Input
            id="title"
            placeholder="e.g. Truck #4 — won't start"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Equipment */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="equipment-name">Equipment name / ID <span className="text-destructive">*</span></Label>
            <Input
              id="equipment-name"
              placeholder="e.g. Truck #4, Mower B"
              value={equipmentName}
              onChange={(e) => setEquipmentName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="equipment-type">Equipment type</Label>
            <Select value={equipmentType} onValueChange={setEquipmentType}>
              <SelectTrigger id="equipment-type">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <Label htmlFor="location">Where is the equipment? <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            id="location"
            placeholder="e.g. Main yard, Job site — Oak St, Trailer 2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Describe the problem <span className="text-destructive">*</span></Label>
          <Textarea
            id="description"
            placeholder="What's wrong? What happened? Any sounds, error lights, or symptoms…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            required
          />
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <Label htmlFor="priority">How urgent is this? <span className="text-destructive">*</span></Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Repair tag */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hasRepairTag}
            onChange={(e) => setHasRepairTag(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span className="text-sm">
            I&apos;ve already attached a repair tag to the equipment
          </span>
        </label>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" disabled={!isValid || submitting} className="w-full">
          {submitting ? "Submitting…" : "Submit Repair Request"}
        </Button>
      </form>
    </div>
  );
}
