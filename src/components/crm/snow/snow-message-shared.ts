"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@/lib/hooks/use-query";
import { chunk } from "@/lib/utils/chunk";
import { snowTagValues, type SnowTagContext } from "@/lib/snow/message-tags";
import type { CRMJobVisit, StormEvent } from "@/types/crm-jobs";

/** The client fields the snow messaging dialogs need to decide who can be reached. */
export type SnowClientRow = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailBouncedAt: string | null;
  phone: string | null;
  smsOptIn: boolean;
};

/** Usable = an address that looks like one and has not hard-bounced (a bounce blocks ALL email, service notices included). */
export function hasUsableEmail(c: Pick<SnowClientRow, "email" | "emailBouncedAt">): boolean {
  return !!c.email && c.email.includes("@") && !c.emailBouncedAt;
}

/** Why a client's email can't be used, or null when it can. */
export function emailProblem(c: Pick<SnowClientRow, "email" | "emailBouncedAt">): "missing" | "bounced" | null {
  if (!c.email || !c.email.includes("@")) return "missing";
  if (c.emailBouncedAt) return "bounced";
  return null;
}

/** Visits → one entry per client (several stops for one client get ONE message). */
export function groupVisitsByClient(visits: CRMJobVisit[]): { clientId: string; visits: CRMJobVisit[] }[] {
  const map = new Map<string, CRMJobVisit[]>();
  for (const v of visits) {
    if (!v.clientId) continue;
    const list = map.get(v.clientId) ?? [];
    list.push(v);
    map.set(v.clientId, list);
  }
  return [...map.entries()].map(([clientId, list]) => ({ clientId, visits: list }));
}

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))];
}

/**
 * Tag values for one client's stop(s). With several stops the distinct
 * addresses/services/crews are listed together so the one message covers them all.
 */
export function snowContextForStops(
  stops: CRMJobVisit[],
  event: Pick<StormEvent, "name" | "eventDate"> | null,
  crewNameOf: (v: CRMJobVisit) => string | null,
): Record<string, string> {
  const lead = stops[0];
  const addresses = unique(stops.map((v) => [v.job?.serviceAddress, v.job?.serviceCity].filter(Boolean).join(", ")));
  const services = unique(stops.map((v) => v.job?.services?.[0]?.serviceName || v.job?.invoiceDescription));
  const crews = unique(stops.map(crewNameOf));
  const statuses = unique(stops.map((v) => v.status));
  const ctx: SnowTagContext = {
    stormName: event?.name ?? null,
    stormDate: event?.eventDate ?? lead?.scheduledDate ?? null,
    service: services.join(", ") || null,
    crew: crews.join(", ") || null,
    status: statuses.length === 1 ? statuses[0] : lead?.status ?? null,
    startTime: stops.length === 1 ? lead?.startTime ?? null : null,
    address: addresses.join("; ") || null,
  };
  return snowTagValues(ctx);
}

/** Loads the messaging fields for a set of client ids (chunked: a select-all can be hundreds of ids). */
export function useSnowClients(clientIds: string[], enabled: boolean) {
  const key = [...clientIds].sort().join(",");
  return useQuery({
    queryKey: ["snow-message-clients", key],
    enabled: enabled && clientIds.length > 0,
    staleTime: 0,
    queryFn: async (): Promise<SnowClientRow[]> => {
      const supabase = createClient();
      const rows: SnowClientRow[] = [];
      for (const part of chunk(clientIds)) {
        const { data, error } = await supabase
          .from("clients")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id, display_name, first_name, last_name, primary_email, email_bounced_at, primary_phone, sms_opt_in" as any)
          .in("id", part)
          .is("deleted_at", null);
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (data ?? []) as any[]) {
          rows.push({
            id: r.id,
            displayName: r.display_name,
            firstName: r.first_name ?? null,
            lastName: r.last_name ?? null,
            email: (r.primary_email as string | null)?.trim() || null,
            emailBouncedAt: r.email_bounced_at ?? null,
            phone: (r.primary_phone as string | null)?.trim() || null,
            smsOptIn: !!r.sms_opt_in,
          });
        }
      }
      return rows;
    },
  });
}
