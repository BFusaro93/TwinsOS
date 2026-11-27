"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useContracts } from "@/lib/hooks/use-contracts";

interface Props {
  clientId?: string;
  value: string | null;
  onChange: (contractId: string | null) => void;
  /** Smaller label/trigger for the job detail's compact edit panel. */
  compact?: boolean;
}

/**
 * Contract dropdown scoped to one client, shared by the New Job dialog and the
 * job's Edit panel. A job's contract decides how its visits bill: covered
 * services are billed inside the contract price (no separate invoice), and an
 * unsigned (draft / sent) contract holds completed visits until it is signed or
 * cancelled.
 */
export function ContractPicker({ clientId, value, onChange, compact }: Props) {
  const { data: contracts } = useContracts(clientId);
  const picked = (contracts ?? []).find((c) => c.id === value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label className={compact ? "text-xs text-muted-foreground" : undefined}>Contract</Label>
      <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
        <SelectTrigger className={compact ? "text-sm" : undefined}><SelectValue placeholder="No contract" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No contract</SelectItem>
          {/* A cancelled contract covers nothing, so it isn't offered. Each option shows
              its status: an unsigned one holds the job's visits until it's signed. */}
          {(contracts ?? [])
            .filter((c) => c.status !== "cancelled" || c.id === value)
            .map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title} <span className="capitalize text-muted-foreground">· {c.status}{!c.isActive ? ", inactive" : ""}</span>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {picked && (picked.status === "draft" || picked.status === "sent") && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          This contract isn&apos;t signed yet ({picked.status}). Completed visits are held — not invoiced — until it&apos;s
          signed (then the contract covers them) or cancelled (then they bill per visit).
        </p>
      )}
    </div>
  );
}
