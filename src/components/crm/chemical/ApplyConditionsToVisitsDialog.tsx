"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChemicalSettings } from "@/lib/hooks/use-chemical-tracking";
import { fetchJobConditions, useApplyConditionsToVisits } from "@/lib/hooks/use-chemical-wizard";

interface Props {
  open: boolean;
  onClose: () => void;
  visitIds: string[];
  /** A job whose location stands in for the day's weather ("Fill from weather"). */
  weatherJobId: string | undefined;
  dateLabel: string;
}

/** One set of conditions (temperature, wind, pH) for every chemical visit in the list, instead
 *  of the same figures typed into each. Blank fields are left as they are on each visit. */
export function ApplyConditionsToVisitsDialog({ open, onClose, visitIds, weatherJobId, dateLabel }: Props) {
  const { data: settings } = useChemicalSettings();
  const apply = useApplyConditionsToVisits();
  const showWeather = settings?.conditionsDisplay === "weather" || settings?.conditionsDisplay === "both";
  const showPh = settings?.conditionsDisplay === "ph" || settings?.conditionsDisplay === "both";
  const [temperature, setTemperature] = useState("");
  const [windSpeed, setWindSpeed] = useState("");
  const [windDirection, setWindDirection] = useState("");
  const [phLevel, setPhLevel] = useState("");
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (open) {
      setTemperature("");
      setWindSpeed("");
      setWindDirection("");
      setPhLevel("");
    }
  }, [open]);

  async function fillFromWeather() {
    if (!weatherJobId) return;
    setLooking(true);
    try {
      const reading = await fetchJobConditions(weatherJobId);
      if (!reading) {
        toast.error("No weather is available for this location right now.");
        return;
      }
      if (reading.temperatureF != null) setTemperature(String(reading.temperatureF));
      if (reading.windMph != null) setWindSpeed(String(reading.windMph));
      if (reading.windDirection) setWindDirection(reading.windDirection);
    } finally {
      setLooking(false);
    }
  }

  const num = (v: string) => (v.trim() === "" ? undefined : Number.isFinite(parseFloat(v)) ? parseFloat(v) : undefined);
  const hasValue = [temperature, windSpeed, windDirection, phLevel].some((v) => v.trim() !== "");

  async function submit() {
    try {
      const updated = await apply.mutateAsync({
        visitIds,
        values: {
          ...(showWeather && num(temperature) !== undefined && { temperature: num(temperature) }),
          ...(showWeather && num(windSpeed) !== undefined && { windSpeed: num(windSpeed) }),
          ...(showWeather && windDirection.trim() && { windDirection: windDirection.trim() }),
          ...(showPh && num(phLevel) !== undefined && { phLevel: num(phLevel) }),
        },
      });
      toast.success(`Conditions saved on ${updated} chemical record${updated === 1 ? "" : "s"}`);
      onClose();
    } catch {
      toast.error("Couldn't save the conditions");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conditions for all {visitIds.length} visits — {dateLabel}</DialogTitle>
          <DialogDescription>
            Saved on every chemical record for these visits. Leave a box blank to keep what each visit already has.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {showWeather && (
            <>
              <label className="grid gap-1 text-xs text-muted-foreground">Temp (°F)
                <Input className="h-8 text-xs" type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Wind speed (mph)
                <Input className="h-8 text-xs" type="number" value={windSpeed} onChange={(e) => setWindSpeed(e.target.value)} />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Wind direction
                <Input className="h-8 text-xs" value={windDirection} onChange={(e) => setWindDirection(e.target.value)} placeholder="e.g. NW" />
              </label>
            </>
          )}
          {showPh && (
            <label className="grid gap-1 text-xs text-muted-foreground">pH level
              <Input className="h-8 text-xs" type="number" step="0.1" value={phLevel} onChange={(e) => setPhLevel(e.target.value)} />
            </label>
          )}
          {!showWeather && !showPh && (
            <p className="col-span-2 text-xs text-muted-foreground">Conditions aren&apos;t recorded for this company (Settings &gt; Chemical Tracking).</p>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          {showWeather && weatherJobId ? (
            <Button variant="outline" size="sm" onClick={() => void fillFromWeather()} disabled={looking}>
              {looking ? "Looking up…" : "Fill from weather"}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void submit()} disabled={!hasValue || apply.isPending || visitIds.length === 0}>
              {apply.isPending ? "Saving…" : `Apply to ${visitIds.length} visits`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
