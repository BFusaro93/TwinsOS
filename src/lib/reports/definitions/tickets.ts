import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import { buildResult, col } from "@/lib/reports/helpers";

// ============================================================
// Tickets section — pre-built reports.
// ============================================================

export const TICKET_REPORTS: PrebuiltReportDef[] = [
  {
    key: "tickets-past-due",
    section: "tickets",
    name: "My Past Due Tickets",
    description: "Shows open tickets whose due date has already passed.",
    filters: [],
    run: async ({ supabase }) => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("crm_tickets")
        .select("ticket_number, subject, category, assigned_to, due_date, clients(display_name)")
        .eq("status", "open")
        .not("due_date", "is", null)
        .lt("due_date", today)
        .is("deleted_at", null)
        .order("due_date", { ascending: true })
        .limit(2000);
      if (error) throw new Error(error.message);

      type Row = {
        ticket_number: number | null;
        subject: string | null;
        category: string | null;
        assigned_to: string | null;
        due_date: string | null;
        clients: { display_name: string | null } | null;
      };

      const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
        ticket_number: r.ticket_number,
        subject: r.subject,
        category: r.category,
        client_name: r.clients?.display_name ?? "",
        assigned_to: r.assigned_to,
        due_date: r.due_date,
      }));

      return buildResult(
        [
          col("ticket_number", "Ticket #", "number", false),
          col("subject", "Subject"),
          col("category", "Category"),
          col("client_name", "Client"),
          col("assigned_to", "Assignee"),
          col("due_date", "Due Date", "date"),
        ],
        rows
      );
    },
  },
];
