"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SnowCapKind } from "@/lib/snow-caps";

/** The default for a snow job nobody tagged: a salt service is salting, anything else plowing. */
export function guessSnowCapKind(serviceNames: (string | null | undefined)[]): SnowCapKind {
  return serviceNames.some((n) => /salt|de-?ic/i.test(n ?? "")) ? "salt" : "inches";
}

/** What a Monthly Flat Rate snow job counts toward on its contract's caps. */
export function SnowCapKindSelect({
  value,
  onChange,
  small,
}: {
  value: SnowCapKind;
  onChange: (kind: SnowCapKind) => void;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className={small ? "text-xs text-muted-foreground" : undefined}>Counts toward contract caps as</Label>
      <Select value={value} onValueChange={(v) => onChange(v as SnowCapKind)}>
        <SelectTrigger className={small ? "text-sm" : undefined} aria-label="Counts toward contract caps as"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="inches">Plowing (inch, event and push caps)</SelectItem>
          <SelectItem value="salt">Salting (salt cap)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
