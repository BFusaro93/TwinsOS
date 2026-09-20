import { z } from "zod";

const BILLING_FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly", "annual", "one_time"] as const;
const CONTRACT_STATUSES = ["draft", "sent", "signed", "active", "expired", "cancelled"] as const;

/**
 * Dates are YYYY-MM-DD only. start_date/end_date are `date` columns, so an
 * ISO instant like "2026-09-18T02:00:00Z" is cast in UTC and lands on the
 * PREVIOUS day for an America/New_York operation — enough to shift when a
 * contract starts billing by a day.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date (no time component)");
/** signedAt is a timestamptz: a full ISO instant, or a bare date meaning midnight. */
const isoDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    "must be an ISO 8601 date or timestamp"
  );

// jan..dec -> cents. Lets a seasonal contract (e.g. lower in winter, higher
// in growing season) bill a different amount each calendar month, cycling
// every year — not a year-over-year escalation schedule. The key used is the
// month of the generated invoice's date.
const monthlyAmountsSchema = z
  .object({
    jan: z.number().int().nonnegative().optional(),
    feb: z.number().int().nonnegative().optional(),
    mar: z.number().int().nonnegative().optional(),
    apr: z.number().int().nonnegative().optional(),
    may: z.number().int().nonnegative().optional(),
    jun: z.number().int().nonnegative().optional(),
    jul: z.number().int().nonnegative().optional(),
    aug: z.number().int().nonnegative().optional(),
    sep: z.number().int().nonnegative().optional(),
    oct: z.number().int().nonnegative().optional(),
    nov: z.number().int().nonnegative().optional(),
    dec: z.number().int().nonnegative().optional(),
  })
  .optional()
  .describe(
    "Per-calendar-month overrides of the per-invoice amount, in CENTS, keyed jan..dec — for a seasonal contract that bills less in winter. Cycles every year; it is not an escalation schedule."
  );

const AMOUNT_DESCRIPTION =
  "The amount charged on EACH invoice this contract generates, in CENTS (integer) — NOT an annualised or monthly-equivalent figure. " +
  "With billingFrequency 'annual' and a $12,000/yr contract, pass 1200000: the client is invoiced $12,000 once a year. " +
  "With 'monthly' and $1,000/mo, pass 100000.";

const FREQUENCY_DESCRIPTION =
  "How often this contract generates an invoice. Defaults to 'monthly'. " +
  "monthly/quarterly/annual bill on billingDayOfMonth (quarterly and annual only in months 0, 3, 6, 9 … / 0, 12, 24 … counted from the contract's startDate, falling back to signedAt); " +
  "weekly/biweekly bill every 7/14 days from startDate and ignore billingDayOfMonth; " +
  "one_time bills exactly once, on the first billing run at or after startDate. " +
  "monthlyAmountCents is the per-invoice amount at every frequency.";

const STATUS_DESCRIPTION =
  "Defaults to 'draft', which does NOT bill. Automatic invoicing requires status 'signed' or 'active' (plus autoGenerate and isActive), " +
  "so a contract recorded through this API stays inert until a human advances it in the app — or until the caller deliberately passes 'signed'/'active' here, " +
  "which starts real invoicing against a real client on the next billing day.";

const contractItemSchema = z.object({
  clientId: z.string().uuid().describe("The client to bill. Must belong to the calling key's organization."),
  title: z.string().min(1).describe("Contract title; also the default invoice description."),
  estimateId: z.string().uuid().optional(),
  startDate: isoDate
    .optional()
    .describe("YYYY-MM-DD. Billing does not start before this date, and it anchors every non-monthly cadence."),
  endDate: isoDate.optional().describe("YYYY-MM-DD. Billing stops once this date has passed."),
  monthlyAmountCents: z.number().int().nonnegative().optional().describe(AMOUNT_DESCRIPTION),
  billingFrequency: z.enum(BILLING_FREQUENCIES).optional().describe(FREQUENCY_DESCRIPTION),
  autoRenew: z.boolean().optional(),
  notes: z.string().optional(),
  status: z.enum(CONTRACT_STATUSES).optional().describe(STATUS_DESCRIPTION),
  signedAt: isoDateTime
    .optional()
    .describe("When the contract was actually signed, for one executed outside the app. Does not by itself start billing."),
  signedBy: z.string().optional(),
  // 1-31, not 1-28: the app's own contract form allows the full range, and
  // both billing paths already clamp a day past the end of a short month
  // down to that month's last day. Capping at 28 here silently rejected a
  // perfectly ordinary "bills on the 30th" contract.
  billingDayOfMonth: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe(
      "Day of month to bill on, 1-31. Clamped to the last day of shorter months (a 31 contract bills Feb 28). Ignored for weekly/biweekly."
    ),
  billMonthInAdvance: z.boolean().optional().describe("Date and label the invoice for NEXT calendar month."),
  paymentType: z.string().optional(),
  poNumber: z.string().optional(),
  autoGenerate: z
    .boolean()
    .optional()
    .describe("Whether the nightly cron generates invoices. Only takes effect once status is 'signed' or 'active'."),
  isActive: z.boolean().optional(),
  includeSubProperties: z.boolean().optional(),
  source: z.string().optional(),
  salesRepId: z.string().uuid().optional(),
  monthlyAmounts: monthlyAmountsSchema,
  invoiceLineItems: z.array(z.string()).optional(),
  defaultService: z.string().optional(),
});

/**
 * Unlike the app's own contract UI (which only ever stamps signed_at/
 * signed_by via now() at status-transition time), this endpoint is meant for
 * recording contracts that were already executed externally (e.g. signed in
 * DocuSign outside the app) — so it deliberately accepts a historical
 * signedAt/signedBy. No fabrication risk: this records a fact that already
 * happened, it doesn't create a new binding agreement the way a normal
 * in-app "New Contract" would.
 *
 * ── Default status is "draft", and that matters ───────────────────────────
 * Both billing paths (the nightly /api/cron/contract-invoices and the manual
 * "Create Invoices" click) require status ∈ {signed, active}. auto_generate
 * and is_active default to true at the DB level, so status is the ONLY brake
 * on a newly-created contract — and this endpoint used to default it to
 * "active" whenever signedAt was present, meaning an agent recording a
 * historical contract started charging a real client on the next billing day
 * with no human step anywhere. POs created through this API are frozen at
 * "requested" for exactly the same reason; contracts now have the equivalent.
 *
 * A caller can still opt in deliberately by passing status: "active" (or
 * "signed"), which is an explicit, documented choice rather than a side
 * effect of supplying a signature date.
 *
 * Supports either one contract (top-level fields) or a bulk batch via
 * `contracts`, for entering a spreadsheet of already-signed agreements in
 * one call. If `contracts` is present, the top-level fields are ignored.
 */
export const createContractSchema = z.object({
  clientId: z.string().uuid().optional().describe("The client to bill. Must belong to the calling key's organization."),
  title: z.string().min(1).optional().describe("Contract title; also the default invoice description."),
  estimateId: z.string().uuid().optional(),
  startDate: isoDate
    .optional()
    .describe("YYYY-MM-DD. Billing does not start before this date, and it anchors every non-monthly cadence."),
  endDate: isoDate.optional().describe("YYYY-MM-DD. Billing stops once this date has passed."),
  monthlyAmountCents: z.number().int().nonnegative().optional().describe(AMOUNT_DESCRIPTION),
  billingFrequency: z.enum(BILLING_FREQUENCIES).optional().describe(FREQUENCY_DESCRIPTION),
  autoRenew: z.boolean().optional(),
  notes: z.string().optional(),
  status: z.enum(CONTRACT_STATUSES).optional().describe(STATUS_DESCRIPTION),
  signedAt: isoDateTime
    .optional()
    .describe("When the contract was actually signed, for one executed outside the app. Does not by itself start billing."),
  signedBy: z.string().optional(),
  billingDayOfMonth: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe(
      "Day of month to bill on, 1-31. Clamped to the last day of shorter months (a 31 contract bills Feb 28). Ignored for weekly/biweekly."
    ),
  billMonthInAdvance: z.boolean().optional().describe("Date and label the invoice for NEXT calendar month."),
  paymentType: z.string().optional(),
  poNumber: z.string().optional(),
  autoGenerate: z
    .boolean()
    .optional()
    .describe("Whether the nightly cron generates invoices. Only takes effect once status is 'signed' or 'active'."),
  isActive: z.boolean().optional(),
  includeSubProperties: z.boolean().optional(),
  source: z.string().optional(),
  salesRepId: z.string().uuid().optional(),
  monthlyAmounts: monthlyAmountsSchema,
  invoiceLineItems: z.array(z.string()).optional(),
  defaultService: z.string().optional(),
  contracts: z
    .array(contractItemSchema)
    .min(1)
    .max(50)
    .optional()
    .describe("Bulk batch. When present, the top-level fields are ignored."),
});

export type CreateContractItem = z.infer<typeof contractItemSchema>;
