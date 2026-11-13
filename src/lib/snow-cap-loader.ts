import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { capDisplayDay, computeSnowCapStatus, hasSnowCap, type SnowCapContract, type SnowCapKind, type SnowCapReset, type SnowCapStatus, type SnowCapVisit } from "@/lib/snow-caps";

/** The cap columns of a crm_contracts row (as selected by loadContractsById). */
export interface SnowCapContractColumns {
  id: string;
  start_date: string | null;
  end_date: string | null;
  snow_inch_cap?: number | string | null;
  snow_salt_cap?: number | null;
  snow_pushes_cap?: number | null;
  snow_events_cap?: number | null;
  snow_overage_per_push_cents?: number | null;
  snow_overage_per_event_cents?: number | null;
  covers_snow?: boolean | null;
  snow_cap_reset?: string | null;
  snow_overage_description?: string | null;
  snow_overage_per_inch_cents?: number | null;
  snow_overage_per_salt_cents?: number | null;
}

export function toSnowCapContract(row: SnowCapContractColumns): SnowCapContract {
  return {
    id: row.id,
    startDate: row.start_date,
    inchCap: row.snow_inch_cap != null ? Number(row.snow_inch_cap) : null,
    saltCap: row.snow_salt_cap ?? null,
    pushesCap: row.snow_pushes_cap ?? null,
    eventsCap: row.snow_events_cap ?? null,
    overagePerPushCents: row.snow_overage_per_push_cents ?? null,
    overagePerEventCents: row.snow_overage_per_event_cents ?? null,
    resetPeriod: (row.snow_cap_reset === "monthly" ? "monthly" : "contract_year") as SnowCapReset,
    overageDescription: row.snow_overage_description ?? null,
    overagePerInchCents: row.snow_overage_per_inch_cents ?? null,
    overagePerSaltCents: row.snow_overage_per_salt_cents ?? null,
  };
}

const IN_CHUNK = 100;

/** Loads each capped contract's completed Monthly Flat Rate snow visits and
 *  counts them against its caps. `isCovered` says whether the contract covers
 *  a storm on a day (a visit it doesn't cover bills on its own — outside the
 *  contract dates — and never counts toward a cap). Contracts without a cap
 *  are skipped (no entry). */
export async function loadSnowCapStatuses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  contracts: SnowCapContractColumns[],
  isCovered: (contractId: string, day: string) => boolean,
  today: string
): Promise<Map<string, SnowCapStatus>> {
  const out = new Map<string, SnowCapStatus>();
  const capped = contracts.filter((c) => c.covers_snow !== false && hasSnowCap(toSnowCapContract(c)));
  if (capped.length === 0) return out;

  type Row = {
    id: string;
    job_id: string;
    scheduled_date: string;
    storm_event_id: string | null;
    snow_depth_inches: number | string | null;
    crew_group_secondary: boolean | null;
    crm_jobs: { contract_id: string; snow_cap_kind: string | null };
  };
  const byContract = new Map<string, SnowCapVisit[]>();
  for (let i = 0; i < capped.length; i += IN_CHUNK) {
    const ids = capped.slice(i, i + IN_CHUNK).map((c) => c.id);
    const rows = await fetchAllRows<Row>(() =>
      supabase
        .from("crm_job_visits")
        .select("id, job_id, scheduled_date, storm_event_id, snow_depth_inches, crew_group_secondary, crm_jobs!inner(contract_id, snow_cap_kind)")
        .in("crm_jobs.contract_id", ids)
        .eq("crm_jobs.job_type", "snow")
        .eq("crm_jobs.invoice_type", "monthly_flat_rate")
        .is("crm_jobs.deleted_at", null)
        .eq("status", "completed")
        .is("deleted_at", null)
        .order("scheduled_date", { ascending: true })
        .order("id", { ascending: true })
    );
    for (const r of rows) {
      const contractId = r.crm_jobs.contract_id;
      if (!isCovered(contractId, r.scheduled_date)) continue;
      const list = byContract.get(contractId) ?? [];
      list.push({
        id: r.id,
        jobId: r.job_id,
        scheduledDate: r.scheduled_date,
        stormEventId: r.storm_event_id,
        snowDepthInches: r.snow_depth_inches != null ? Number(r.snow_depth_inches) : null,
        crewGroupSecondary: !!r.crew_group_secondary,
        capKind: (r.crm_jobs.snow_cap_kind === "salt" ? "salt" : "inches") as SnowCapKind,
      });
      byContract.set(contractId, list);
    }
  }
  for (const c of capped) {
    const cap = toSnowCapContract(c);
    out.set(c.id, computeSnowCapStatus(cap, byContract.get(c.id) ?? [], capDisplayDay({ startDate: c.start_date, endDate: c.end_date }, today)));
  }
  return out;
}
