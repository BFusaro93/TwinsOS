"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { useSnowCapStatus } from "@/lib/hooks/use-snow-caps";
import { useSetJobSnowCapKind } from "@/lib/hooks/use-snow-cap-job-kind";
import type { SnowCapKind } from "@/lib/snow-caps";
import { toast } from "sonner";

/** The cap fields a contract form edits (see crm_contracts.snow_*). */
export interface SnowCapsFields {
  snowInchCap: number | null;
  snowSaltCap: number | null;
  snowCapReset: "contract_year" | "monthly";
  snowOverageDescription: string;
  snowOveragePerInchCents: number | null;
  snowOveragePerSaltCents: number | null;
}

export interface SnowCapJob {
  id: string;
  label: string;
  kind: SnowCapKind;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start gap-3">
      <span className="pt-2 text-sm text-slate-700 dark:text-neutral-300">{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** Snow caps and overage on a contract: what the flat price covers per period
 *  (inches and/or salt applications), what bills beyond it, and the live usage. */
export function SnowCapsSection({
  state,
  onChange,
  contractId,
  snowJobs,
}: {
  state: SnowCapsFields;
  onChange: (patch: Partial<SnowCapsFields>) => void;
  contractId?: string;
  snowJobs: SnowCapJob[];
}) {
  const { data: usage } = useSnowCapStatus(contractId);
  const { mutateAsync: setKind } = useSetJobSnowCapKind();
  const hasInch = (state.snowInchCap ?? 0) > 0;
  const hasSalt = (state.snowSaltCap ?? 0) > 0;
  return (
    <div className="mb-4 rounded border">
      <div className="rounded-t-md bg-[#5a5a5a] px-4 py-2 text-sm font-semibold text-white">Snow Caps &amp; Overage</div>
      <div className="p-4">
        <p className="mb-3 text-[11px] text-muted-foreground">
          The flat price covers snow work up to these caps each period. Past a cap, the work bills in Snow Invoicing as overage instead.
          Leave a cap blank for no limit. Inches count once per storm (its deepest reading); salts count once per salting visit.
        </p>
        <Row label="Inch cap">
          <div className="flex items-center gap-2">
            <Input
              type="number" min={0} step="0.5" className="h-8 w-24 text-sm" aria-label="Inch cap"
              value={state.snowInchCap ?? ""}
              onChange={(e) => { const n = parseFloat(e.target.value); onChange({ snowInchCap: Number.isFinite(n) && n > 0 ? n : null }); }}
            />
            <span className="text-xs text-muted-foreground">inches per period</span>
          </div>
        </Row>
        <Row label="Salt cap">
          <div className="flex items-center gap-2">
            <Input
              type="number" min={0} step="1" className="h-8 w-24 text-sm" aria-label="Salt cap"
              value={state.snowSaltCap ?? ""}
              onChange={(e) => { const n = parseInt(e.target.value, 10); onChange({ snowSaltCap: Number.isFinite(n) && n > 0 ? n : null }); }}
            />
            <span className="text-xs text-muted-foreground">salt applications per period (per salt job)</span>
          </div>
        </Row>
        {(hasInch || hasSalt) && (
          <>
            <Row label="Cap resets">
              <Select value={state.snowCapReset} onValueChange={(v) => onChange({ snowCapReset: v as SnowCapsFields["snowCapReset"] })}>
                <SelectTrigger className="h-8 w-56 text-sm" aria-label="Cap reset period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract_year">Each contract year</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Overage description">
              <Input
                className="h-8 w-80 text-sm" placeholder="Snow overage" aria-label="Overage invoice description"
                value={state.snowOverageDescription}
                onChange={(e) => onChange({ snowOverageDescription: e.target.value })}
              />
            </Row>
            {hasInch && (
              <Row label="Overage per inch">
                <CurrencyInput className="h-8 w-28 text-sm" cents={state.snowOveragePerInchCents ?? 0} blankWhenZero aria-label="Overage price per inch over the cap"
                  onCommit={(cents) => onChange({ snowOveragePerInchCents: cents > 0 ? cents : null })} />
              </Row>
            )}
            {hasSalt && (
              <Row label="Overage per salt">
                <CurrencyInput className="h-8 w-28 text-sm" cents={state.snowOveragePerSaltCents ?? 0} blankWhenZero aria-label="Overage price per salt over the cap"
                  onCommit={(cents) => onChange({ snowOveragePerSaltCents: cents > 0 ? cents : null })} />
              </Row>
            )}
            {snowJobs.length > 0 && (
              <Row label="Linked snow jobs count toward">
                <div className="space-y-1.5">
                  {snowJobs.map((j) => (
                    <div key={j.id} className="flex items-center gap-2">
                      <span className="w-56 truncate text-xs text-slate-700 dark:text-neutral-300">{j.label}</span>
                      <Select
                        value={j.kind}
                        onValueChange={(v) => void setKind({ jobId: j.id, kind: v as SnowCapKind }).catch(() => toast.error("Couldn't change what this job counts toward"))}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs" aria-label={`${j.label} counts toward`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inches">Inch cap</SelectItem>
                          <SelectItem value="salt">Salt cap</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">Plowing jobs count toward the inch cap, salting jobs toward the salt cap. Saved immediately.</p>
                </div>
              </Row>
            )}
          </>
        )}
        {usage && (
          <Row label="Usage">
            <div className="space-y-0.5 text-sm">
              <p className="text-[11px] text-muted-foreground">{usage.periodLabel} (saved caps)</p>
              {usage.inchCap != null && (
                <p className={usage.inchesAtCap ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                  {usage.inchesUsed} of {usage.inchCap} in used{usage.inchesAtCap ? " — further snow bills as overage" : ""}
                </p>
              )}
              {usage.saltCap != null && (
                <p className={usage.saltsUsed >= usage.saltCap ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                  {usage.saltsUsed} of {usage.saltCap} salts used{usage.saltsUsed >= usage.saltCap ? " — further salting bills as overage" : ""}
                </p>
              )}
            </div>
          </Row>
        )}
      </div>
    </div>
  );
}
