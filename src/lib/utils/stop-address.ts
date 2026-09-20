/**
 * One address-resolution order for "where does the crew actually drive for
 * this stop?", shared by the dispatch board, the snow board, the crew app and
 * the route optimizer.
 *
 * These used to each answer it their own way. The board fell back to the
 * client's billing address; /api/crm/route-optimize looked only at
 * crm_jobs.service_address and silently dropped every stop without one — so a
 * board full of addressed stops could post visitIds to an optimizer that saw
 * fewer than two of them and answered "Not enough visits have service
 * addresses for route optimization."
 *
 * The order below is the one /api/crm/jobs/geocode already uses to drop the
 * map pin (E-19), so a stop optimizes to, and navigates to, the same place it
 * is pinned:
 *   1. crm_jobs.service_* — the address snapshot taken when the job was made
 *   2. the linked client_properties row (crm_jobs.property_id)
 *   3. the client's service address
 *   4. the client's billing address
 *
 * Billing is deliberately last and deliberately present. For the residential
 * client billed at the property they're served at (clients.billing_same_as_service)
 * it IS the service address, and it's the only address many imported clients
 * carry. It can also be a PO box or an off-site property manager — which is
 * exactly why a real service address at any of the three levels above wins.
 *
 * Resolution is per-source, not per-field: a job with a street but no city
 * takes the job's (empty) city rather than mixing in the client's billing
 * city, which would produce an address that exists nowhere.
 */

export type StopAddressParts = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type StopAddressSource = "job" | "property" | "client_service" | "client_billing";

export type ResolvedStopAddress = {
  parts: StopAddressParts;
  source: StopAddressSource;
};

type JobAddressRow = {
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
};

type PropertyAddressRow = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type ClientAddressRow = {
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
};

/**
 * PostgREST returns a to-one embed as an object, but as a single-element array
 * when it can't prove the relationship is to-one (and some of our selects nest
 * it two levels deep). Accept either.
 */
export function embeddedOne<T>(embed: T | T[] | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null;
  return embed ?? null;
}

/**
 * Picks the first source that has an actual street line. A bare city/state
 * with no street isn't routable and isn't worth a paid Google lookup, so it
 * doesn't count as having an address.
 */
export function resolveStopAddress(input: {
  job?: JobAddressRow | null;
  property?: PropertyAddressRow | null;
  client?: ClientAddressRow | null;
}): ResolvedStopAddress | null {
  const { job, property, client } = input;

  const candidates: ResolvedStopAddress[] = [
    {
      source: "job",
      parts: {
        address: job?.service_address ?? null,
        city: job?.service_city ?? null,
        state: job?.service_state ?? null,
        zip: job?.service_zip ?? null,
      },
    },
    {
      source: "property",
      parts: {
        address: property?.address ?? null,
        city: property?.city ?? null,
        state: property?.state ?? null,
        zip: property?.zip ?? null,
      },
    },
    {
      source: "client_service",
      parts: {
        address: client?.service_address ?? null,
        city: client?.service_city ?? null,
        state: client?.service_state ?? null,
        zip: client?.service_zip ?? null,
      },
    },
    {
      source: "client_billing",
      parts: {
        address: client?.billing_address ?? null,
        city: client?.billing_city ?? null,
        state: client?.billing_state ?? null,
        zip: client?.billing_zip ?? null,
      },
    },
  ];

  return candidates.find((c) => c.parts.address?.trim()) ?? null;
}

/** The resolved parts as a single line Google (or a person) can read. */
export function formatStopAddress(parts: StopAddressParts | null | undefined): string {
  if (!parts?.address?.trim()) return "";
  return [parts.address, parts.city, parts.state, parts.zip]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * The shape the CRMJob mappers splice back onto a raw crm_jobs row, so a
 * mapped job's serviceAddress/City/State/Zip is the address the stop is
 * actually routed and navigated to rather than only what the job row stored.
 */
export function stopAddressJobFields(resolved: ResolvedStopAddress | null): JobAddressRow {
  return {
    service_address: resolved?.parts.address ?? null,
    service_city: resolved?.parts.city ?? null,
    service_state: resolved?.parts.state ?? null,
    service_zip: resolved?.parts.zip ?? null,
  };
}
