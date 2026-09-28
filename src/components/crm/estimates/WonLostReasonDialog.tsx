"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import {
  LOST_REASONS_LIST,
  WON_REASONS_LIST,
  resolveOutcomeReasons,
} from "@/lib/estimates/outcome-reasons";

export type EstimateTier = "basic" | "standard" | "premium";

interface Props {
  stage: "accepted" | "lost";
  open: boolean;
  /** Good/Better/Best estimate with more than one tier still open: accepting
   *  requires choosing the tier the client bought (the others are marked
   *  lost, same as the public/portal accept). Omit or pass [] otherwise. */
  tierOptions?: { value: EstimateTier; label: string }[];
  onConfirm: (reason: string, selectedTier?: EstimateTier) => void;
  onCancel: () => void;
}

export function WonLostReasonDialog({ stage, open, tierOptions = [], onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const [tier, setTier] = useState<EstimateTier | "">("");
  const needsTier = stage === "accepted" && tierOptions.length > 0;
  // Won and Lost each read their own org-configured list; an unconfigured
  // list falls back to a default set so the dropdown is never empty or, worse,
  // offers "Client accepted proposal" as the only reason a quote was LOST.
  const { data: configured = [] } = useOrgList(stage === "lost" ? LOST_REASONS_LIST : WON_REASONS_LIST);
  const reasons = resolveOutcomeReasons(stage, configured.map((r) => r.value));

  function handleConfirm() {
    if (!reason) return;
    if (needsTier && !tier) return;
    onConfirm(reason, needsTier && tier ? tier : undefined);
    setReason("");
    setTier("");
  }

  function handleCancel() {
    setReason("");
    setTier("");
    onCancel();
  }

  const label = stage === "accepted" ? "Accepted" : "Lost";
  const colorClass = stage === "accepted" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as {label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {needsTier && (
            <div className="space-y-1.5">
              <Label htmlFor="tier-select">Tier the client accepted <span className="text-red-500">*</span></Label>
              <Select value={tier} onValueChange={(v) => setTier(v as EstimateTier)}>
                <SelectTrigger id="tier-select">
                  <SelectValue placeholder="Select a tier…" />
                </SelectTrigger>
                <SelectContent>
                  {tierOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">The other tiers&apos; lines are marked lost.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="reason-select">Reason <span className="text-red-500">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason-select">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {configured.length === 0 && (
              <p className="text-xs text-slate-500">
                Showing default reasons.{" "}
                <a href="/crm/settings?tab=estimates" className="text-brand-600 underline">
                  Customize in Settings
                </a>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            disabled={!reason || (needsTier && !tier)}
            className={colorClass + " text-white"}
            onClick={handleConfirm}
          >
            Mark as {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
