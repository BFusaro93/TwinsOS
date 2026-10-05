"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import {
  INJURY_CLAIM_ROUTE_LABELS,
  INJURY_INCIDENT_TYPE_LABELS,
  INJURY_SEVERITY_LABELS,
  INJURY_TYPE_OPTIONS,
} from "@/lib/constants";
import type { InjuryCaseInput } from "@/lib/hooks/use-injury-cases";
import type { InjuryClaimRoute, InjuryIncidentType, InjurySeverity } from "@/types";

interface Props {
  initial?: Partial<InjuryCaseInput>;
  /** Show the office-only fields (severity, days away, claim route, investigation). */
  office?: boolean;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  error?: unknown;
  onSubmit: (values: InjuryCaseInput) => void | Promise<void>;
  onCancel?: () => void;
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      {([["Yes", true], ["No", false]] as const).map(([label, v]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(value === v ? null : v)}
          className={cn(
            "px-4 py-1.5 text-sm transition-colors",
            value === v ? "bg-brand-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Shared by the Injury Cases dialog (office = true) and the field "Injury
 * Report" page. Mirrors Twins' paper "Employee's Report of Injury" — the
 * supervisor's full investigation stays on the PDF; the case holds the intake
 * answers plus the investigation outcome (cause / corrective action).
 */
export function InjuryCaseForm({ initial, office = false, submitLabel, pendingLabel, pending, error, onSubmit, onCancel }: Props) {
  const [incidentType, setIncidentType] = useState<InjuryIncidentType>(initial?.incidentType ?? "injury");
  const [employeeName, setEmployeeName] = useState(initial?.employeeName ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [supervisorName, setSupervisorName] = useState(initial?.supervisorName ?? "");
  const [toldSupervisor, setToldSupervisor] = useState<boolean | null>(initial?.toldSupervisor ?? null);
  const [dateOfIncident, setDateOfIncident] = useState(initial?.dateOfIncident ?? new Date().toLocaleDateString("en-CA"));
  const [timeOfIncident, setTimeOfIncident] = useState(initial?.timeOfIncident ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [activity, setActivity] = useState(initial?.activity ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [witnesses, setWitnesses] = useState(initial?.witnesses ?? "");
  const [equipmentInvolved, setEquipmentInvolved] = useState(initial?.equipmentInvolved ?? "");
  const [ppeUsed, setPpeUsed] = useState(initial?.ppeUsed ?? "");
  const [injuryType, setInjuryType] = useState(initial?.injuryType ?? "");
  const [bodyPart, setBodyPart] = useState(initial?.bodyPart ?? "");
  const [sawDoctor, setSawDoctor] = useState<boolean | null>(initial?.sawDoctor ?? null);
  const [doctorName, setDoctorName] = useState(initial?.doctorName ?? "");
  const [doctorPhone, setDoctorPhone] = useState(initial?.doctorPhone ?? "");
  const [doctorVisitDate, setDoctorVisitDate] = useState(initial?.doctorVisitDate ?? "");
  const [previouslyInjured, setPreviouslyInjured] = useState<boolean | null>(initial?.previouslyInjured ?? null);
  const [preventionSuggestion, setPreventionSuggestion] = useState(initial?.preventionSuggestion ?? "");
  const [severity, setSeverity] = useState<InjurySeverity>(initial?.severity ?? "first_aid");
  const [daysAway, setDaysAway] = useState(String(initial?.daysAway ?? 0));
  const [treatment, setTreatment] = useState(initial?.treatment ?? "");
  const [recordable, setRecordable] = useState(initial?.recordable ?? false);
  const [claimRoute, setClaimRoute] = useState<string>(initial?.claimRoute ?? "undecided");
  const [cause, setCause] = useState(initial?.cause ?? "");
  const [correctiveAction, setCorrectiveAction] = useState(initial?.correctiveAction ?? "");

  const nearMiss = incidentType === "near_miss";
  // Suggestions only — typing any name still works. An exact employee name is
  // what lets the supervisor alert find their login.
  const { data: employees = [] } = useSelectableEmployees();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          incidentType,
          employeeName: employeeName.trim(),
          jobTitle: jobTitle.trim() || null,
          supervisorName: supervisorName.trim() || null,
          toldSupervisor,
          dateOfIncident,
          timeOfIncident: timeOfIncident || null,
          location: location.trim() || null,
          activity: activity.trim() || null,
          description: description.trim(),
          witnesses: witnesses.trim() || null,
          equipmentInvolved: equipmentInvolved.trim() || null,
          ppeUsed: ppeUsed.trim() || null,
          injuryType: injuryType || null,
          bodyPart: bodyPart.trim() || null,
          sawDoctor: nearMiss ? null : sawDoctor,
          doctorName: !nearMiss && sawDoctor ? doctorName.trim() || null : null,
          doctorPhone: !nearMiss && sawDoctor ? doctorPhone.trim() || null : null,
          doctorVisitDate: !nearMiss && sawDoctor ? doctorVisitDate || null : null,
          previouslyInjured: nearMiss ? null : previouslyInjured,
          preventionSuggestion: preventionSuggestion.trim() || null,
          // Office-only values are left out of a field submission so the
          // defaults (first aid, 0 days, not recordable) apply.
          ...(office && {
            severity: nearMiss ? null : severity,
            daysAway: nearMiss ? 0 : Math.max(0, parseInt(daysAway, 10) || 0),
            treatment: treatment.trim() || null,
            recordable: nearMiss ? false : recordable,
            claimRoute: nearMiss || claimRoute === "undecided" ? null : (claimRoute as InjuryClaimRoute),
            cause: cause.trim() || null,
            correctiveAction: correctiveAction.trim() || null,
          }),
        });
      }}
    >
      <Section title="What are you reporting?">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(INJURY_INCIDENT_TYPE_LABELS) as [InjuryIncidentType, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setIncidentType(value)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                incidentType === value ? "border-brand-500 bg-brand-50 text-brand-700" : "bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {nearMiss && (
          <p className="text-xs text-muted-foreground">
            A near miss is an event that could have hurt someone but didn&apos;t. Report these too — no matter how minor.
          </p>
        )}
      </Section>

      <Section title="Who and when">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{nearMiss ? "Your name" : "Injured employee"}</Label>
            <Input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} required placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Job title <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Supervisor <span className="text-xs text-muted-foreground">(they&apos;ll be alerted)</span></Label>
            <Input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} list="injury-supervisor-options" autoComplete="off" />
            <datalist id="injury-supervisor-options">
              {employees.map((e) => <option key={e.id} value={`${e.firstName} ${e.lastName}`.trim()} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Have you told your supervisor?</Label>
            <div><YesNo value={toldSupervisor} onChange={setToldSupervisor} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={dateOfIncident} onChange={(e) => setDateOfIncident(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Time <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input type="time" value={timeOfIncident} onChange={(e) => setTimeOfIncident(e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="What happened">
        <div className="space-y-1.5">
          <Label>Where, exactly, did it happen?</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Job site, shop, vehicle…" />
        </div>
        <div className="space-y-1.5">
          <Label>What were you doing at the time?</Label>
          <Input value={activity} onChange={(e) => setActivity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Describe step by step what led up to it</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Equipment / tools being used <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input value={equipmentInvolved} onChange={(e) => setEquipmentInvolved(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>PPE being worn <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input value={ppeUsed} onChange={(e) => setPpeUsed(e.target.value)} placeholder="Gloves, glasses, hearing…" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Witnesses <span className="text-xs text-muted-foreground">(if any)</span></Label>
          <Input value={witnesses} onChange={(e) => setWitnesses(e.target.value)} placeholder="Names" />
        </div>
      </Section>

      <Section title={nearMiss ? "How could someone have been hurt?" : "The injury"}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!nearMiss && (
            <div className="space-y-1.5">
              <Label>Nature of injury <span className="text-xs text-muted-foreground">(most serious)</span></Label>
              <Select value={injuryType} onValueChange={setInjuryType}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {INJURY_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={cn("space-y-1.5", nearMiss && "sm:col-span-2")}>
            <Label>{nearMiss ? "Body parts at risk" : "Body parts injured"}</Label>
            <Input value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} placeholder="e.g. Left hand" />
          </div>
        </div>
        {!nearMiss && (
          <>
            <div className="space-y-1.5">
              <Label>Did you see a doctor?</Label>
              <div><YesNo value={sawDoctor} onChange={setSawDoctor} /></div>
            </div>
            {sawDoctor && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Doctor / clinic</Label>
                  <Input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input type="tel" value={doctorPhone} onChange={(e) => setDoctorPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Visit date</Label>
                  <Input type="date" value={doctorVisitDate} onChange={(e) => setDoctorVisitDate(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Has this part of your body been injured before?</Label>
              <div><YesNo value={previouslyInjured} onChange={setPreviouslyInjured} /></div>
            </div>
          </>
        )}
      </Section>

      <Section title="Prevention">
        <div className="space-y-1.5">
          <Label>What could have been done to prevent this?</Label>
          <Textarea value={preventionSuggestion} onChange={(e) => setPreventionSuggestion(e.target.value)} rows={3} />
        </div>
      </Section>

      {office && (
        <Section title="Office use">
          {!nearMiss && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as InjurySeverity)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(INJURY_SEVERITY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Days away from work</Label>
                  <Input type="number" min={0} value={daysAway} onChange={(e) => setDaysAway(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Treatment given <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Textarea value={treatment} onChange={(e) => setTreatment(e.target.value)} rows={2} placeholder="First aid, clinic visit, ER…" />
              </div>
              <div className="space-y-1.5">
                <Label>Cost handled through</Label>
                <Select value={claimRoute} onValueChange={setClaimRoute}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="undecided">Not decided yet</SelectItem>
                    {Object.entries(INJURY_CLAIM_ROUTE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose self-pay if the company covers the costs instead of filing a workers&apos; comp claim — track them on the Expenses tab.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={recordable} onCheckedChange={(c) => setRecordable(c === true)} />
                OSHA recordable
              </label>
            </>
          )}
          <div className="space-y-1.5">
            <Label>What caused it? <span className="text-xs text-muted-foreground">(from the investigation)</span></Label>
            <Textarea value={cause} onChange={(e) => setCause(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Corrective action</Label>
            <Textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} rows={2} placeholder="Training, guard the hazard, new policy…" />
          </div>
        </Section>
      )}

      {error ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : String(error)}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</Button>
      </div>
    </form>
  );
}
