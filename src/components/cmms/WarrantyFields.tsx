"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import type { ResolvedWarranty, WarrantyFormValue } from "@/lib/utils/warranty";

interface WarrantyFieldsProps {
  idPrefix: string;
  value: WarrantyFormValue;
  onChange: (value: WarrantyFormValue) => void;
  /** The record's purchase date, used as the start of a coverage period when no start date is given. */
  purchaseDate: string;
  resolved: ResolvedWarranty;
}

/** Warranty section of the asset and vehicle forms. */
export function WarrantyFields({ idPrefix, value, onChange, purchaseDate, resolved }: WarrantyFieldsProps) {
  const set = (patch: Partial<WarrantyFormValue>) => onChange({ ...value, ...patch });
  const derivedEnd = value.mode === "term" ? resolved.fields.warrantyEndDate : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium leading-none">Enter warranty as</span>
        <SegmentedControl
          ariaLabel="Warranty entry mode"
          options={[
            { value: "end_date", label: "End date" },
            { value: "term", label: "Coverage period" },
          ] as const}
          value={value.mode}
          onChange={(mode) => set({ mode })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${idPrefix}-warranty-start`}>Warranty Start</Label>
          <Input
            id={`${idPrefix}-warranty-start`}
            type="date"
            value={value.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
          />
          {value.mode === "term" && !value.startDate && (
            <p className="text-xs text-slate-500">
              {purchaseDate ? `Blank uses the purchase date (${formatDate(purchaseDate)}).` : "Blank uses the purchase date."}
            </p>
          )}
        </div>

        {value.mode === "end_date" ? (
          <div className="grid content-start gap-1.5">
            <Label htmlFor={`${idPrefix}-warranty-end`}>Warranty End</Label>
            <Input
              id={`${idPrefix}-warranty-end`}
              type="date"
              value={value.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
            />
          </div>
        ) : (
          <div className="grid content-start gap-1.5">
            <Label htmlFor={`${idPrefix}-warranty-term`}>Coverage Period</Label>
            <div className="flex gap-2">
              <Input
                id={`${idPrefix}-warranty-term`}
                type="number"
                min={1}
                step={1}
                value={value.termValue}
                onChange={(e) => set({ termValue: e.target.value })}
                placeholder="e.g. 3"
                className="w-24"
              />
              <Select value={value.termUnit} onValueChange={(u) => set({ termUnit: u as WarrantyFormValue["termUnit"] })}>
                <SelectTrigger className="flex-1" aria-label="Coverage period unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="years">Years</SelectItem>
                  <SelectItem value="months">Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {derivedEnd && (
              <p className="text-xs text-slate-500">Covered through {formatDate(derivedEnd)}</p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-warranty-notes`}>Warranty Notes</Label>
        <Input
          id={`${idPrefix}-warranty-notes`}
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="e.g. Powertrain 5 yr / 2,000 hrs — dealer extended plan"
        />
      </div>

      {resolved.error && <p className="text-xs text-red-500">{resolved.error}</p>}
    </div>
  );
}
