"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { computeLineItem, getBreakevenRateCents } from "@/lib/estimate-calc";
import { recalcEstimateTotals } from "@/lib/hooks/use-estimates";
// getBreakevenRateCents lives alongside computeLineItem — same module, same maths.
import type { CRMTicket } from "@/types/crm-tickets";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";

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
 *
 * CONVERTING EXACTLY ONCE
 *
 * This is four writes from a browser, and only the last (the ticket link) was
 * what the UI read back to decide the ticket had been converted. Anything that
 * interrupted the run — closed tab, dropped connection, a rejected insert —
 * left an orphan estimate the button knew nothing about, so the next click
 * built another one. Two people on the same ticket duplicated it with nothing
 * failing at all.
 *
 * So the claim is taken by the FIRST write instead of the last:
 * estimates.upsell_ticket_id is uniquely indexed per live estimate, which
 * makes "this ticket is now converted" a single atomic statement. A second
 * attempt collides (23505) and creates nothing. A resumed attempt finds the
 * estimate it already made and finishes the steps that were missed rather than
 * starting over — so a half-finished conversion heals on the next click.
 */
export function useCreateEstimateFromUpsell() {
  // The estimate is dated on the org's calendar, not the converting user's.
  const orgTimeZone = useOrgTimeZone();
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

      // The claim. Unique per ticket across live estimates, so if this ticket
      // has already been converted the insert fails here and nothing is
      // created — no lock, no read-then-write, no window to lose.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { data: estimate, error: estError } = await (supabase as any)
        .from("estimates")
        .insert({
          created_by: user?.id ?? null,
          client_id: ticket.clientId,
          description,
          estimate_date: todayInZone(orgTimeZone),
          stage: "draft",
          overhead_rate_bps: overheadRow?.flat_overhead_rate_bps ?? 0,
          upsell_ticket_id: ticket.id,
        })
        .select("id, estimate_number")
        .single();

      // 23505 = the unique index fired: an estimate for this ticket exists.
      // That is either a genuine second conversion (someone else got there
      // first) or this same user resuming a run that died partway. Both want
      // the SAME estimate, so pick it up and finish the remaining steps
      // instead of reporting an error or building a duplicate.
      let resumed = false;
      if (estError?.code === "23505") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supabase as any)
          .from("estimates")
          .select("id, estimate_number")
          .eq("upsell_ticket_id", ticket.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (!existing) {
          throw new Error("This ticket has already been quoted, but that estimate isn't visible to you.");
        }
        estimate = existing;
        estError = null;
        resumed = true;
      }
      if (estError) throw estError;

      // The suggested service, if the ticket still has one. A ticket created
      // before upsell_service_id existed, or whose service was since deleted,
      // still converts — just without a pre-filled line.
      let lineAdded = false;
      // On a resume the line may already be there — adding a second one would
      // double the quote. Only an estimate with no lines at all gets one.
      let alreadyHasLines = false;
      if (resumed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (supabase as any)
          .from("estimate_line_items")
          .select("id", { count: "exact", head: true })
          .eq("estimate_id", estimate.id)
          .is("deleted_at", null);
        alreadyHasLines = (count ?? 0) > 0;
        lineAdded = alreadyHasLines;
      }
      if (ticket.upsellServiceId && !alreadyHasLines) {
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

      // rpt_upsells reads the outcome off this link, so it still has to exist —
      // but it is no longer what prevents a double conversion, and on a resume
      // it may already be there. Insert it only when it's missing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingLink } = await (supabase as any)
        .from("crm_ticket_links")
        .select("id")
        .eq("ticket_id", ticket.id)
        .eq("link_type", "estimate")
        .eq("linked_id", estimate.id)
        .maybeSingle();

      if (!existingLink) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: linkError } = await (supabase as any).from("crm_ticket_links").insert({
          ticket_id: ticket.id,
          link_type: "estimate",
          linked_id: estimate.id,
          linked_label: `Estimate #${estimate.estimate_number}`,
        });
        // The estimate is claimed either way, so a failure here can no longer
        // cause a duplicate — clicking again resumes and retries just this
        // step. It still has to surface, because until the link exists the
        // upsell reports as unquoted.
        if (linkError) throw linkError;
      }

      return {
        estimateId: estimate.id as string,
        estimateNumber: estimate.estimate_number as number,
        lineAdded,
        resumed,
      };
    },
    onSuccess: (_res, ticket) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["crm-ticket-links", ticket.id] });
      qc.invalidateQueries({ queryKey: ["crm-tickets"] });
    },
  });
}
