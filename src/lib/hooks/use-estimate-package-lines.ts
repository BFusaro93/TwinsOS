"use client";

import { toast } from "sonner";
import { getBreakevenRateCents } from "@/lib/estimate-calc";
import { useUpsertLineItem } from "@/lib/hooks/use-estimates";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { useClient, useClientProperties } from "@/lib/hooks/use-clients";
import { useCustomFieldDefs, useClientCustomFieldValues } from "@/lib/hooks/use-client-custom-fields";
import { usePropertyCustomFieldValues } from "@/lib/hooks/use-rate-matrix";
import { useApplyServiceEquipmentDefaults } from "@/lib/hooks/use-equipment";
import type { ClientTakeoff } from "@/lib/estimates/client-takeoff";
import { priceServiceLine } from "@/lib/estimates/service-line";
import { stripHtml } from "@/lib/utils/strip-html";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";
import type { CRMPackage } from "@/types/crm-packages";

/**
 * The estimate's client measurements (turf sq ft, mulch bed sq ft, numeric custom
 * fields). When the estimate is for one of the client's properties, its quantities come
 * from that property: a satellite property's own measurements (blank stays blank rather
 * than borrowing another address's numbers), while the client's own-address (master)
 * property still falls back to the client's figures it mirrors. No property = the client's.
 */
export function useEstimateTakeoff(clientId: string | null | undefined, propertyId: string | null | undefined): ClientTakeoff | null {
  const { data: client } = useClient(clientId ?? "");
  // Prefetch only: the pricing reads the property's field value straight from the DB so
  // it can't race this query. Keeping the hook warms the cache.
  const { data: propertyFieldValues = [] } = usePropertyCustomFieldValues(propertyId ?? "");
  const { data: customFieldDefs = [] } = useCustomFieldDefs();
  const { data: customFieldValues = [] } = useClientCustomFieldValues(clientId ?? "");
  const { data: clientProperties = [] } = useClientProperties(clientId ?? "", { keepId: propertyId ?? null });
  const estimateProperty = propertyId ? clientProperties.find((p) => p.id === propertyId) ?? null : null;
  const useSatelliteTakeoff = !!estimateProperty && !estimateProperty.isMaster;
  if (!client) return null;
  return {
    turfSqft: useSatelliteTakeoff ? estimateProperty.turfSqft ?? null : (estimateProperty?.turfSqft ?? client.turfSqft ?? null),
    mulchBedSqft: useSatelliteTakeoff ? estimateProperty.mulchBedSqft ?? null : (estimateProperty?.mulchBedSqft ?? client.mulchBedSqft ?? null),
    grossSqft: useSatelliteTakeoff ? estimateProperty.grossSqft ?? null : (estimateProperty?.grossSqft ?? client.grossSqft ?? null),
    // A satellite uses only its own property-level values; the client-level ones
    // belong to the master address and must not leak in.
    customNumeric: Object.fromEntries(
      (useSatelliteTakeoff ? propertyFieldValues : customFieldValues).flatMap((v) => {
        const def = customFieldDefs.find((d) => d.id === v.fieldDefId);
        return def && def.fieldType === "number" && typeof v.valueNumber === "number"
          ? [[def.name.toLowerCase(), v.valueNumber]]
          : [];
      }),
    ),
  };
}

/**
 * Adds a package to an estimate as one tagged line per package service, in package order,
 * under a section header named after the package. Each line keeps the package's own
 * pricing (its per-visit rate, falling back to the service's default, or the Rate Matrix /
 * client takeoff when the step has no price of its own) and its visit count
 * (visitsIncluded). The package's "description on estimate" is stored on the section
 * header (with the package id), which is what the proposal, PDF and portal print as the
 * package's main wording.
 *
 * Shared by the estimate grid's Add Package and by templates that contain packages.
 * Returns false (after a toast) when it could not add the whole package.
 */
export function useAddPackageLines({ clientId, propertyId }: { clientId?: string | null; propertyId?: string | null }) {
  const { data: services } = useCRMServices();
  const { data: orgSettings } = useOrgSettings();
  const breakevenRateCents = getBreakevenRateCents(orgSettings?.customizations);
  const takeoff = useEstimateTakeoff(clientId, propertyId);
  const { mutateAsync: upsert } = useUpsertLineItem();
  const { mutateAsync: applyEquipmentDefaults } = useApplyServiceEquipmentDefaults();
  const activeServices = (services ?? []).filter((s) => s.isActive);

  return async function addPackageLines(
    pkg: CRMPackage,
    { estimateId, startSortOrder }: { estimateId: string; startSortOrder: number },
  ): Promise<boolean> {
    const steps = [...(pkg.services ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    if (steps.length === 0) {
      toast.error(`"${pkg.name}" has no services — add them in CRM Settings → Packages`);
      return false;
    }
    try {
      await upsert({
        estimateId,
        item: {
          row_type: "section",
          section_name: pkg.name,
          // Marks the section as a package group; its estimate_desc is the
          // package's client-facing wording.
          package_id: pkg.id,
          estimate_desc: pkg.descriptionOnEstimate ? stripHtml(pkg.descriptionOnEstimate) || null : null,
          status: "quote",
          sort_order: startSortOrder,
          service_name: "",
          qty: 0,
          rate_cents: 0,
          visits: 1,
          total_cents: 0,
          cost_cents: 0,
          calc_type: 1,
        },
      });
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        // The package step may reference its service by id or only by name
        // (older packages) — same fallback NewJobDialog.pickPackage uses.
        const match = activeServices.find((s) => s.id === step.serviceId)
          ?? activeServices.find((s) => s.name.trim().toLowerCase() === step.serviceName.trim().toLowerCase());
        const rate = step.defaultRateCents || match?.defaultRateCents || 0;
        const item = await priceServiceLine({
          id: match?.id,
          name: step.serviceName,
          unit: match?.unit ?? undefined,
          productionRate: match?.productionRateSqftPerHr ?? null,
          budgetMethod: match?.budgetMethod,
          rateCents: rate,
          estimateDesc: match?.descriptionOnEstimate || null,
          invoiceDesc: match?.invoiceDescription ?? null,
          visits: step.visitsIncluded || 1,
          packageId: pkg.id,
          sortOrder: startSortOrder + 1 + i,
          budgetedHours: step.defaultBHrs ?? null,
          lockRate: !!step.defaultRateCents,
        }, { clientId, propertyId, takeoff, breakevenRateCents, defaultSortOrder: startSortOrder + 1 + i });
        const added = await upsert({ estimateId, item });
        // Pre-fill the service's default equipment (internal cost) onto the new line.
        if (match?.id && added?.id) {
          await applyEquipmentDefaults({ serviceId: match.id, lineItemId: added.id, estimateId }).catch(() => {
            toast.error("Added the item, but couldn't pre-fill its default equipment");
          });
        }
      }
      return true;
    } catch (err) {
      toast.error(mutationErrorMessage(err, `Failed to add package "${pkg.name}"`));
      return false;
    }
  };
}
