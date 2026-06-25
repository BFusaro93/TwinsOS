"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useCrews,
  useEmployees,
  useCreateCrew,
  useUpdateCrew,
  useAddCrewMember,
  useRemoveCrewMember,
  useUpdateCrewMember,
} from "@/lib/hooks/use-employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Users, X, Search } from "lucide-react";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import type { CRMCrew, CRMCrewMember } from "@/types/crm-employees";

// ── constants ─────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const MAP_ICON_OPTIONS = [
  "Gold", "Silver", "Blue", "Green", "Red", "Orange", "Purple", "Teal", "Gray",
];

const ROUTE_SHEET_OPTIONS = [
  "Standard Route Sheet", "Custom Route Sheet 1", "Custom Route Sheet 2",
];

// ── section bar ───────────────────────────────────────────────────────────────

function SectionBar({ title }: { title: string }) {
  return (
    <div className="rounded-t-md bg-[#5a5a5a] px-4 py-2 text-sm font-semibold text-white">
      {title}
    </div>
  );
}

// ── day-of-week multi-select ──────────────────────────────────────────────────

function DayOfWeekSelect({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const allSelected = ALL_DAYS.every((d) => value.includes(d));
  const label = allSelected
    ? "7 selected"
    : value.length === 0
    ? "None"
    : `${value.length} selected`;

  return (
    <div className="relative">
      <Select>
        <SelectTrigger className="h-8 text-sm w-36">
          <span>{label}</span>
        </SelectTrigger>
        <SelectContent>
          {DAYS_SHORT.map((day, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50"
              onClick={() => {
                const next = value.includes(i)
                  ? value.filter((d) => d !== i)
                  : [...value, i].sort();
                onChange(next);
              }}
            >
              <Checkbox checked={value.includes(i)} className="pointer-events-none" />
              <span className="text-sm">{day}</span>
            </div>
          ))}
          <div className="border-t mx-2 my-1" />
          <div
            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50"
            onClick={() => onChange(allSelected ? [] : [...ALL_DAYS])}
          >
            <Checkbox checked={allSelected} className="pointer-events-none" />
            <span className="text-sm font-medium">Select All</span>
          </div>
        </SelectContent>
      </Select>
    </div>
  );
}

// ── team assignments tab ──────────────────────────────────────────────────────

function TeamAssignmentsTab({ crew }: { crew: CRMCrew }) {
  // Use live query so the list refreshes after add/remove without needing to reopen
  const { data: allCrews } = useCrews(false);
  const liveCrew = allCrews?.find((c) => c.id === crew.id) ?? crew;
  const { data: allEmployees } = useEmployees(true);
  const { mutateAsync: addMember, isPending: adding } = useAddCrewMember();
  const { mutateAsync: removeMember } = useRemoveCrewMember();
  const { mutateAsync: updateMember } = useUpdateCrewMember();

  const existingIds = new Set((liveCrew.members ?? []).map((m) => m.employeeId));
  const available = (allEmployees ?? []).filter((e) => !existingIds.has(e.id));

  async function handleAdd() {
    if (available.length === 0) return;
    const emp = available[0];
    try {
      await addMember({
        crewId: crew.id,
        employeeId: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        daysOfWeek: [...ALL_DAYS],
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to add assignment: ${msg}`);
    }
  }

  async function handleChangeEmployee(member: CRMCrewMember, newEmployeeId: string) {
    const emp = (allEmployees ?? []).find((e) => e.id === newEmployeeId);
    const name = emp ? `${emp.firstName} ${emp.lastName}` : newEmployeeId;
    try {
      await removeMember({ crewId: crew.id, employeeId: member.employeeId });
      await addMember({ crewId: crew.id, employeeId: newEmployeeId, name, daysOfWeek: member.daysOfWeek });
    } catch {
      toast.error("Failed to update assignment");
    }
  }

  async function handleChangeDays(member: CRMCrewMember, days: number[]) {
    try {
      await updateMember({ id: member.id, updates: { days_of_week: days } });
    } catch {
      toast.error("Failed to update days");
    }
  }

  async function handleRemove(member: CRMCrewMember) {
    try {
      await removeMember({ crewId: crew.id, employeeId: member.employeeId });
    } catch {
      toast.error("Failed to remove assignment");
    }
  }

  const members = liveCrew.members ?? [];

  return (
    <div className="rounded border">
      <SectionBar title="Team Assignments" />
      <div className="p-0">
        {members.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No assignments yet — click Add Assignment below
          </div>
        ) : (
          <div className="divide-y">
            {members.map((m) => {
              const otherEmployees = (allEmployees ?? []).filter(
                (e) => e.id === m.employeeId || !existingIds.has(e.id)
              );
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2">
                  <Select
                    value={m.employeeId}
                    onValueChange={(v) => handleChangeEmployee(m, v)}
                  >
                    <SelectTrigger className="h-8 text-sm flex-1 min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {otherEmployees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.firstName} {e.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DayOfWeekSelect
                    value={m.daysOfWeek}
                    onChange={(days) => handleChangeDays(m, days)}
                  />
                  <button
                    className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
                    onClick={() => handleRemove(m)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="p-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleAdd}
            disabled={adding || available.length === 0}
          >
            Add Assignment
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── team details tab ──────────────────────────────────────────────────────────

function Field({
  label,
  bold,
  children,
}: {
  label: string;
  bold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr className="border-b last:border-0">
      <td
        className={`px-4 py-2.5 text-sm whitespace-nowrap w-48 ${bold ? "font-semibold text-slate-800" : "text-slate-500"}`}
      >
        {label}
      </td>
      <td className="px-4 py-2">{children}</td>
    </tr>
  );
}

async function geocodeAddress(address: string, city: string, state: string, zip: string) {
  const parts = [address, city, state, zip].filter(Boolean).join(", ");
  if (!parts) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(parts)}`,
      { headers: { "Accept-Language": "en" } }
    );
    const json = await res.json();
    if (json[0]) return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
  } catch { /* silently ignore */ }
  return null;
}

function TeamDetailsTab({
  form,
  onChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (k: string, v: any) => void;
}) {
  const [geocoding, setGeocoding] = useState(false);

  const handleAddressBlur = useCallback(async () => {
    const { starting_address, starting_city, starting_state, starting_zip } = form;
    if (!starting_address && !starting_city && !starting_zip) return;
    setGeocoding(true);
    const result = await geocodeAddress(
      starting_address ?? "",
      starting_city ?? "",
      starting_state ?? "",
      starting_zip ?? ""
    );
    setGeocoding(false);
    if (result) {
      onChange("starting_lat", result.lat);
      onChange("starting_lng", result.lng);
    }
  }, [form, onChange]);

  return (
    <div className="rounded border">
      <SectionBar title="Team Details" />
      <table className="w-full text-sm">
        <tbody>
          <Field label="Description">
            <Input
              className="h-8 text-sm"
              value={form.name ?? ""}
              onChange={(e) => onChange("name", e.target.value)}
            />
          </Field>
          <Field label="Team Code" bold>
            <Input
              className="h-8 text-sm font-mono"
              value={form.code ?? ""}
              onChange={(e) => onChange("code", e.target.value)}
              placeholder="e.g. ENHANCE1"
            />
          </Field>
          <Field label="Tags">
            <Input
              className="h-8 text-sm"
              value={(form.tags ?? []).join(", ")}
              onChange={(e) =>
                onChange(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((t: string) => t.trim())
                    .filter(Boolean)
                )
              }
              placeholder="comma-separated tags"
            />
          </Field>
          <Field label="Route Sheet Format">
            <Select
              value={form.route_sheet_format ?? "none"}
              onValueChange={(v) => onChange("route_sheet_format", v === "none" ? null : v)}
            >
              <SelectTrigger className="h-8 text-sm w-56">
                <SelectValue placeholder="Select Route Sheet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ROUTE_SHEET_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Show In Calendar">
            <Checkbox
              checked={!!form.show_in_calendar}
              onCheckedChange={(c) => onChange("show_in_calendar", !!c)}
            />
          </Field>
          <Field label="Map Icon / Calendar Color">
            <Select
              value={form.map_icon_color ?? "none"}
              onValueChange={(v) => onChange("map_icon_color", v === "none" ? null : v)}
            >
              <SelectTrigger className="h-8 text-sm w-56">
                <SelectValue placeholder="Select color…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {MAP_ICON_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Starting Address">
            <Input
              className="h-8 text-sm"
              value={form.starting_address ?? ""}
              onChange={(e) => onChange("starting_address", e.target.value || null)}
              onBlur={handleAddressBlur}
            />
          </Field>
          <Field label="Starting City">
            <Input
              className="h-8 text-sm"
              value={form.starting_city ?? ""}
              onChange={(e) => onChange("starting_city", e.target.value || null)}
              onBlur={handleAddressBlur}
            />
          </Field>
          <Field label="Starting State">
            <Input
              className="h-8 text-sm w-28"
              value={form.starting_state ?? ""}
              onChange={(e) => onChange("starting_state", e.target.value || null)}
              placeholder="MA"
              onBlur={handleAddressBlur}
            />
          </Field>
          <Field label="Starting Zip">
            <Input
              className="h-8 text-sm w-28"
              value={form.starting_zip ?? ""}
              onChange={(e) => onChange("starting_zip", e.target.value || null)}
              onBlur={handleAddressBlur}
            />
          </Field>
          <Field label="Starting Lat / Lng">
            <div className="flex items-center gap-2">
              <Input
                className="h-8 text-sm w-36 font-mono"
                value={form.starting_lat ?? ""}
                onChange={(e) =>
                  onChange("starting_lat", e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder="Lat"
              />
              <Input
                className="h-8 text-sm w-36 font-mono"
                value={form.starting_lng ?? ""}
                onChange={(e) =>
                  onChange("starting_lng", e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder="Lng"
              />
              {geocoding && (
                <span className="text-xs text-slate-400 animate-pulse">Locating…</span>
              )}
            </div>
          </Field>
        </tbody>
      </table>
    </div>
  );
}

// ── crew dialog ───────────────────────────────────────────────────────────────

function CrewDialog({
  crew,
  open,
  onOpenChange,
}: {
  crew?: CRMCrew;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { mutateAsync: create, isPending: creating } = useCreateCrew();
  const { mutateAsync: update, isPending: updating } = useUpdateCrew();

  // After creating a new crew, we store it here so tabs unlock immediately
  const [activeCrew, setActiveCrew] = useState<CRMCrew | undefined>(crew);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function crewToForm(c: CRMCrew): Record<string, any> {
    return {
      name: c.name, code: c.code, tags: c.tags ?? [],
      route_sheet_format: c.routeSheetFormat,
      show_in_calendar: c.showInCalendar,
      map_icon_color: c.mapIconColor, map_codes: c.mapCodes,
      starting_address: c.startingAddress, starting_city: c.startingCity,
      starting_state: c.startingState, starting_zip: c.startingZip,
      starting_lat: c.startingLat, starting_lng: c.startingLng,
    };
  }

  const emptyForm = { name: "", show_in_calendar: true, tags: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<Record<string, any>>(
    crew ? crewToForm(crew) : emptyForm
  );

  // Sync form when dialog opens for a different crew
  useEffect(() => {
    if (open) {
      setActiveCrew(crew);
      setForm(crew ? crewToForm(crew) : emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, crew]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onChange(k: string, v: any) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!form.name?.trim()) { toast.error("Description is required"); return; }
    try {
      if (!activeCrew) {
        const created = await create(form);
        toast.success("Team created — add assignments below");
        setActiveCrew(created);
        // Stay open so assignments tab is accessible immediately
      } else {
        await update({ id: activeCrew.id, updates: form });
        toast.success("Team saved");
        onOpenChange(false);
      }
    } catch {
      toast.error("Failed to save team");
    }
  }

  const title = activeCrew ? `Edit - ${activeCrew.name}` : "New Team";
  const tabList = [
    { value: "details", label: "Team Details" },
    { value: "assignments", label: "Team Assignments", disabled: !activeCrew },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setActiveCrew(crew); setForm(crew ? crewToForm(crew) : emptyForm); } onOpenChange(o); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="shrink-0 border-b bg-white rounded-none justify-start px-6 py-0 h-10 gap-0">
            {tabList.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={tab.disabled}
                className="h-full rounded-none border-b-2 border-transparent px-4 py-0 text-sm text-brand-600 data-[state=active]:border-slate-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-slate-900 data-[state=active]:font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="details" className="mt-0">
              {activeCrew && (
                <p className="mb-3 text-xs text-green-600 font-medium">
                  ✓ Team created — switch to Team Assignments to add members, then Save.
                </p>
              )}
              <TeamDetailsTab form={form} onChange={onChange} />
            </TabsContent>
            <TabsContent value="assignments" className="mt-0">
              {activeCrew && <TeamAssignmentsTab crew={activeCrew} />}
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 shrink-0 border-t bg-slate-50 px-6 py-4">
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white px-8"
            onClick={handleSave}
            disabled={creating || updating}
          >
            {creating || updating ? "Saving…" : activeCrew ? "Save" : "Create & Continue"}
          </Button>
          <span className="text-slate-400 text-sm">or</span>
          <button
            className="text-brand-600 text-sm hover:underline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── main list ─────────────────────────────────────────────────────────────────

type ActiveFilter = "active" | "inactive" | "all";

export function CrewsList() {
  const { data: crews, isLoading } = useCrews(false);
  const { mutateAsync: update } = useUpdateCrew();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("active");
  const [dialogCrew, setDialogCrew] = useState<CRMCrew | "new" | null>(null);

  const filtered = (crews ?? []).filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && c.isActive) ||
      (filter === "inactive" && !c.isActive);
    return matchesSearch && matchesFilter;
  });

  async function handleDeactivate(id: string, name: string) {
    if (!confirm(`Deactivate crew "${name}"?`)) return;
    try {
      await update({ id, updates: { is_active: false } });
      toast.success(`${name} deactivated`);
    } catch {
      toast.error("Failed to deactivate");
    }
  }

  async function handleActivate(id: string) {
    try {
      await update({ id, updates: { is_active: true } });
      toast.success("Crew activated");
    } catch {
      toast.error("Failed to activate");
    }
  }

  const TAB_FILTERS: { value: ActiveFilter; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Teams"
        description="Assign employees to crews and dispatch jobs"
        action={
          <PermissionGate permission="sched_teams">
            <Button size="sm" onClick={() => setDialogCrew("new")}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Team
            </Button>
          </PermissionGate>
        }
      />

      {/* Dark toolbar (SA style) */}
      <div className="border-b bg-[#4a4a4a] px-4 py-2 flex items-center">
        {TAB_FILTERS.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              filter === t.value
                ? "bg-white text-slate-800"
                : "text-slate-300 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="relative ml-2">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-slate-50">
            <tr className="text-left text-xs font-semibold text-slate-500">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" className="rounded border-slate-300 accent-brand-500" />
              </th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Team Code</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 text-slate-200" />
                    <p className="text-sm text-slate-400">
                      {search ? "No crews match your search" : "No crews yet"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((crew) => (
                <tr
                  key={crew.id}
                  className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => setDialogCrew(crew)}
                >
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="rounded border-slate-300 accent-brand-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-brand-600 hover:underline font-medium">
                      {crew.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">
                    {crew.code ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">
                    {crew.members && crew.members.length > 0
                      ? crew.members.map((m) => m.employeeName ?? "").join(", ")
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td
                    className="px-4 py-2.5 text-slate-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {crew.isActive ? (
                      <button
                        className="text-sm text-slate-700 hover:text-red-600 transition-colors"
                        onClick={() => handleDeactivate(crew.id, crew.name)}
                      >
                        Active
                      </button>
                    ) : (
                      <button
                        className="text-sm text-slate-400 hover:text-green-600 transition-colors"
                        onClick={() => handleActivate(crew.id)}
                      >
                        Inactive
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {dialogCrew && (
        <CrewDialog
          crew={dialogCrew === "new" ? undefined : dialogCrew}
          open={!!dialogCrew}
          onOpenChange={(o) => {
            if (!o) setDialogCrew(null);
          }}
        />
      )}
    </div>
  );
}
