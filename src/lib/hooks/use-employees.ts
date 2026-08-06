"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMEmployee, CRMCrew, CRMCrewMember, CRMCrewLogin } from "@/types/crm-employees";

// ── mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEmployee(row: any): CRMEmployee {
  return {
    id: row.id,
    orgId: row.org_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
    firstName: row.first_name,
    middleInitial: row.middle_initial,
    lastName: row.last_name,
    printOnCheckAs: row.print_on_check_as,
    email: row.email,
    birthDate: row.birth_date,
    resourceCode: row.resource_code,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    driverLicense: row.driver_license,
    isCertifiedDriver: row.is_certified_driver ?? false,
    licenseExpiration: row.license_expiration,
    insuranceEligibility: row.insurance_eligibility,
    coveredByInsurance: row.covered_by_insurance ?? false,
    applicatorLicense: row.applicator_license,
    resourceTags: row.resource_tags ?? [],
    dateHired: row.date_hired,
    phone: row.phone,
    cellPhone: row.cell_phone,
    pager: row.pager,
    maritalStatus: row.marital_status,
    spouseName: row.spouse_name,
    i9Number: row.i9_number,
    dateReleased: row.date_released,
    reasonForRelease: row.reason_for_release,
    citizenship: row.citizenship,
    emergencyPhone: row.emergency_phone,
    emergencyContact: row.emergency_contact,
    numDependants: row.num_dependants ?? 0,
    spousePhone: row.spouse_phone,
    i9ExpirationDate: row.i9_expiration_date,
    rehireDate: row.rehire_date,
    employmentStatus: row.employment_status ?? 'full_time',
    managerId: row.manager_id,
    compensationType: row.compensation_type,
    resourcePin: row.resource_pin,
    eligibleOvertime: row.eligible_overtime ?? false,
    hourlyRateCents: row.hourly_rate_cents ?? 0,
    overtimeRateCents: row.overtime_rate_cents ?? 0,
    vacationDays: row.vacation_days ?? 0,
    sickDays: row.sick_days ?? 0,
    commissionPct: Number(row.commission_pct ?? 0),
    paymentFrequency: row.payment_frequency,
    lastPayRaiseCents: row.last_pay_raise_cents ?? 0,
    lastPayRaiseDate: row.last_pay_raise_date,
    userType: row.user_type ?? 'field',
    showInSelection: row.show_in_selection ?? true,
    showInCalendar: row.show_in_calendar ?? true,
    fieldTimeClock: row.field_time_clock ?? true,
    officeTimeClock: row.office_time_clock ?? false,
    sendTextAlerts: row.send_text_alerts ?? false,
    userRole: row.user_role,
    routeSheetFormat: row.route_sheet_format,
    mapIconColor: row.map_icon_color,
    mapCodes: row.map_codes,
    isSalesRep: row.is_sales_rep ?? false,
    startingAddress: row.starting_address,
    startingCity: row.starting_city,
    startingState: row.starting_state,
    startingZip: row.starting_zip,
    startingLat: row.starting_lat != null ? Number(row.starting_lat) : null,
    startingLng: row.starting_lng != null ? Number(row.starting_lng) : null,
    notes: row.notes,
    isActive: row.is_active ?? true,
    userId: row.user_id ?? null,
    crmRoleId: row.crm_role_id ?? null,
    managerName: row.manager ? `${row.manager.first_name} ${row.manager.last_name}` : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCrew(row: any): CRMCrew {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    color: row.color,
    code: row.code ?? null,
    isActive: row.is_active ?? true,
    foremanId: row.foreman_id ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: row.tags ?? [],
    routeSheetFormat: row.route_sheet_format ?? null,
    mapIconColor: row.map_icon_color ?? null,
    mapCodes: row.map_codes ?? null,
    showInCalendar: row.show_in_calendar ?? true,
    startingAddress: row.starting_address ?? null,
    startingCity: row.starting_city ?? null,
    startingState: row.starting_state ?? null,
    startingZip: row.starting_zip ?? null,
    startingLat: row.starting_lat != null ? Number(row.starting_lat) : null,
    startingLng: row.starting_lng != null ? Number(row.starting_lng) : null,
    userId: row.user_id ?? null,
    foremanName: row.foreman
      ? `${row.foreman.first_name} ${row.foreman.last_name}`
      : undefined,
    members: (row.crm_crew_members ?? []).map(mapCrewMember),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCrewMember(row: any): CRMCrewMember {
  return {
    id: row.id,
    orgId: row.org_id,
    crewId: row.crew_id,
    employeeId: row.employee_id,
    isForeman: row.is_foreman ?? false,
    daysOfWeek: row.days_of_week ?? [0, 1, 2, 3, 4, 5, 6],
    createdAt: row.created_at,
    laborBurdenCentsPerHour: row.labor_burden_cents_per_hour ?? 0,
    employeeName: row.crm_employees
      ? `${row.crm_employees.first_name} ${row.crm_employees.last_name}`
      : (row.name ?? undefined),
    resourceCode: row.crm_employees?.resource_code ?? null,
  };
}

// ── employees ─────────────────────────────────────────────────────────────────

export function useEmployees(activeOnly = true) {
  return useQuery({
    queryKey: ["crm-employees", { activeOnly }],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_employees")
        .select("*, manager:manager_id(first_name, last_name)")
        .is("deleted_at", null)
        .order("last_name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.map(mapEmployee)) as any[];
    },
  });
}

/**
 * Same as useEmployees, filtered to employees with "Show in Selection Lists"
 * on (the default) — for rep/assignee PICKER dropdowns specifically (new
 * estimate/job/invoice/ticket forms, reassign dialogs). The employee
 * management list itself, crew rosters, and dispatch board team assignment
 * must keep using the unfiltered useEmployees — this flag only means "don't
 * offer this person in a picker," not "hide them everywhere." Was a
 * completely inert setting before this — nothing anywhere read it.
 */
export function useSelectableEmployees(activeOnly = true) {
  const query = useEmployees(activeOnly);
  return {
    ...query,
    data: query.data?.filter((e) => e.showInSelection !== false),
  };
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ["crm-employees", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_employees")
        .select("*, manager:manager_id(first_name, last_name)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapEmployee(data);
    },
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (values: Record<string, any>) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_employees")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return mapEmployee(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-employees"] }),
  });
}

export function useBulkImportEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();

      const { data: existing } = await supabase.from("crm_employees").select("id, email").is("deleted_at", null);
      const byEmail = new Map((existing ?? []).filter((e) => e.email).map((e) => [e.email!.trim().toLowerCase(), e.id]));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const r of rows) {
        const firstName = r.firstName?.trim();
        const lastName = r.lastName?.trim();
        if (!firstName || !lastName) { skipped++; continue; }

        const email = r.email?.trim() || null;
        const payload = {
          first_name: firstName,
          last_name: lastName,
          email,
          phone: r.phone?.trim() || null,
          cell_phone: r.cellPhone?.trim() || null,
          address: r.address?.trim() || null,
          city: r.city?.trim() || null,
          state: r.state?.trim() || null,
          zip: r.zip?.trim() || null,
          date_hired: r.dateHired?.trim() || null,
          resource_code: r.resourceCode?.trim() || null,
          hourly_rate_cents: r.hourlyRate ? Math.round(parseFloat(r.hourlyRate) * 100) : 0,
        };

        const existingId = email ? byEmail.get(email.toLowerCase()) : undefined;
        if (existingId) {
          const { error } = await supabase.from("crm_employees").update(payload).eq("id", existingId);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from("crm_employees").insert(payload);
          if (error) throw error;
          created++;
        }
      }

      return { created, updated, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-employees"] });
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_employees")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-employees"] });
      qc.invalidateQueries({ queryKey: ["crm-employees", vars.id] });
    },
  });
}

export function useDeactivateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_employees")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-employees"] }),
  });
}

export function useActivateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_employees")
        .update({ is_active: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-employees"] }),
  });
}

// ── crews ─────────────────────────────────────────────────────────────────────

export function useCrews(activeOnly = false) {
  return useQuery({
    queryKey: ["crm-crews", { activeOnly }],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_crews")
        .select("*, crm_crew_members(*, crm_employees(first_name, last_name, resource_code)), foreman:foreman_id(first_name, last_name)")
        .is("deleted_at", null)
        .order("name");
      if (activeOnly) q = q.eq("is_active", true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (q as any);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.map(mapCrew)) as import("@/types/crm-employees").CRMCrew[];
    },
  });
}

/**
 * Shared crew logins (profiles.role === 'crew') that can be linked to a team via
 * crm_crews.user_id — this is what the Crew App uses to resolve "my crew" when a
 * shared login signs in (see useMyCrewVisits/useMyCrewInfo in use-crew-app.ts).
 */
export function useCrewLogins() {
  return useQuery({
    queryKey: ["crm-crew-logins"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("role", "crew")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((row): CRMCrewLogin => ({
        id: row.id,
        name: row.name ?? row.email ?? "Unnamed login",
        email: row.email ?? null,
      }));
    },
  });
}

export function useCreateCrew() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (values: Record<string, any>) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_crews")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return mapCrew(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crews"] }),
  });
}

export function useUpdateCrew() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crews")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crews"] }),
  });
}

export function useAddCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      crewId,
      employeeId,
      name,
      isForeman,
      daysOfWeek,
    }: {
      crewId: string;
      employeeId: string;
      name: string;
      isForeman?: boolean;
      daysOfWeek?: number[];
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_crew_members")
        .insert({
          crew_id: crewId,
          employee_id: employeeId,
          name,
          is_foreman: isForeman ?? false,
          days_of_week: daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crews"] }),
  });
}

export function useUpdateCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updates: Record<string, any>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_members")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crews"] }),
  });
}

export function useRemoveCrewMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ crewId, employeeId }: { crewId: string; employeeId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_members")
        .delete()
        .eq("crew_id", crewId)
        .eq("employee_id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crews"] }),
  });
}

// ── per-day crew roster overrides ──────────────────────────────────────────────
// crm_crew_members is the PERMANENT default roster (managed in Team settings).
// crm_crew_daily_members lets the dispatch board's Team Assignment dialog move a
// member onto a different crew for one work date without touching that default.

export function useCrewDailyMembers(workDate: string) {
  return useQuery({
    queryKey: ["crm-crew-daily-members", workDate],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_crew_daily_members")
        .select("id, member_id, crew_id")
        .eq("work_date", workDate);
      if (error) throw error;
      return data as { id: string; member_id: string; crew_id: string }[];
    },
    enabled: !!workDate,
  });
}

/** Move a crew member onto `crewId` for `workDate` only — replaces any prior override for that day. */
export function useSetCrewDailyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, crewId, workDate }: { memberId: string; crewId: string; workDate: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_daily_members")
        .upsert({ member_id: memberId, crew_id: crewId, work_date: workDate }, { onConflict: "work_date,member_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-daily-members"] }),
  });
}

/** Revert a crew member back to their default crew for `workDate` (clears the override). */
export function useClearCrewDailyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, workDate }: { memberId: string; workDate: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_daily_members")
        .delete()
        .eq("member_id", memberId)
        .eq("work_date", workDate);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-daily-members"] }),
  });
}
