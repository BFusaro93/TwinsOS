"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { computeLineItem, getBreakevenRateCents } from "@/lib/estimate-calc";
import { recalcEstimateTotals } from "@/lib/hooks/use-estimates";
// getBreakevenRateCents lives alongside computeLineItem — same module, same maths.
import { isoNy } from "@/lib/reports/ny-date";
import type { CRMTicket } from "@/types/crm-tickets";

/**
 * Turns a crew-submitted upsell ticket into a draft estimate in one click.
 *
 * The ticket → estimate link is what makes field upsells measurable: the
 * estimate carries the real pipeline (Sent → Accepted → Won/Lost), so
 * rpt_upsells reads the outcome off the linked estimate's stage rather than
 * off the ticket's own open/closed status.
 *
 * Everything the office would otherwise retype — client, description, and a
 * line item for the suggested service at its catalog rate — is carried across.
 * The line is built through the same computeLineItem() the estimate grid uses,
 * so a converted line is indistinguishable from a hand-added one; duplicating
 * that maths is how the two would quietly drift apart.
 */
export function useCreateEstimateFromUpsell() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ticket: CRMTicket) => {
      if (!ticket.clientId) {
        throw new Error("This ticket has no client, so there's nothing to quote.");
      }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from("profiles").select("org_id").eq("id", user?.id).maybeSingle();

      // Same two org-level defaults a normally-created estimate picks up.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: overheadRow } = profile?.org_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase as any)
            .from("crm_overhead_settings")
            .select("flat_overhead_rate_bps")
            .eq("org_id", profile.org_id)
            .maybeSingle()
        : { data: null };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: org } = profile?.org_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase as any)
            .from("organizations")
            .select("customizations")
            .eq("id", profile.org_id)
            .maybeSingle()
        : { data: null };
      const breakevenRateCents = getBreakevenRateCents(org?.customizations);

      const description = (ticket.subject ?? "Upsell").replace(/^Upsell:\s*/i, "").trim() || "Upsell";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: estimate, error: estError } = await (supabase as any)
        .from("estimates")
        .insert({
          created_by: user?.id ?? null,
          client_id: ticket.clientId,
          description,
          estimate_date: isoNy(new Date()),
          stage: "draft",
          overhead_rate_bps: overheadRow?.flat_overhead_rate_bps ?? 0,
        })
        .select("id, estimate_number")
        .single();
      if (estError) throw estError;

      // The suggested service, if the ticket still has one. A ticket created
      // before upsell_service_id existed, or whose service was since deleted,
      // still converts — just without a pre-filled line.
      let lineAdded = false;
      if (ticket.upsellServiceId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: svc } = await (supabase as any)
          .from("crm_services")
          .select("id, name, unit, default_rate_cents, production_rate_sqft_per_hr, budget_method, description_on_estimate, invoice_description")
          .eq("id", ticket.upsellServiceId)
          .is("deleted_at", null)
          .maybeSingle();

        if (svc) {
          const budgetMethod = svc.budget_method ?? "manual";
          const computed = computeLineItem(
            {
              calcType: 1,
              qty: 1,
              rateCents: svc.default_rate_cents ?? 0,
              visits: 1,
              budgetedHours: 0,
              costCents: 0,
              adjRateCents: null,
              unitType: svc.unit ?? null,
              productionRateSqftPerHr: svc.production_rate_sqft_per_hr ?? null,
              budgetMethod,
            },
            breakevenRateCents
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: liError } = await (supabase as any).from("estimate_line_items").insert({
            estimate_id: estimate.id,
            service_id: svc.id,
            service_name: svc.name,
            status: "quote",
            calc_type: 1,
            qty: 1,
            unit_type: svc.unit ?? null,
            production_rate_sqft_per_hr: svc.production_rate_sqft_per_hr ?? null,
            budget_method: budgetMethod,
            rate_cents: svc.default_rate_cents ?? 0,
            visits: 1,
            cost_cents: computed.costCents,
            adj_rate_cents: null,
            sort_order: 0,
            total_cents: computed.totalCents,
            budgeted_hours: computed.budgetedHours,
            total_budgeted_hours: computed.totalBudgetedHours,
            total_cost_cents: computed.totalCostCents,
            margin_bps: computed.marginBps,
            markup_bps: computed.markupBps,
          });
          if (!liError) {
            lineAdded = true;
            // The estimate header's totals are stored, not derived — inserting
            // a line straight into the table leaves them at zero, which would
            // make a converted upsell report $0 of won revenue (rpt_upsells
            // reads estimates.total_cents). The normal line-item path runs this
            // for the same reason.
            await recalcEstimateTotals(estimate.id);
          }
        }
      }

      // The link is the point of the whole exercise — without it the run never
      // shows up as converted, so a failure here has to surface rather than
      // leave a silently unattributed estimate.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: linkError } = await (supabase as any).from("crm_ticket_links").insert({
        ticket_id: ticket.id,
        link_type: "estimate",
        linked_id: estimate.id,
        linked_label: `Estimate #${estimate.estimate_number}`,
      });
      if (linkError) throw linkError;

      return {
        estimateId: estimate.id as string,
        estimateNumber: estimate.estimate_number as number,
        lineAdded,
      };
    },
    onSuccess: (_res, ticket) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["crm-ticket-links", ticket.id] });
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
    },
  });
}
