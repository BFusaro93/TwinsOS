import { z } from "zod";

/**
 * Every enum below mirrors a DB CHECK constraint on `clients`. They used to
 * be bare `z.string()`, so a wrong value ("Monthly", "med", "mail") sailed
 * past validation and came back as an opaque 500 from the constraint with no
 * hint what the legal values were. The status enum also omitted 'lost', which
 * clients_status_check allows and the app's own pipeline uses.
 */
const CLIENT_STATUSES = ["active", "inactive", "lead", "cancelled", "lost"] as const;
const INVOICE_FREQUENCIES = ["daily", "weekly", "monthly", "upon_completion"] as const;
const INVOICE_DELIVERIES = ["email", "print", "both"] as const;
const CLIENT_PRIORITIES = ["low", "normal", "high"] as const;
const SMS_OPT_IN_SOURCES = ["form", "verbal", "keyword", "manual"] as const;

const clientFields = {
  displayName: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountType: z.enum(["residential", "commercial"]).optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  billingEmail: z.string().email().optional(),
  billingSameAsService: z.boolean().optional(),
  serviceAddress: z.string().optional(),
  serviceCity: z.string().optional(),
  serviceState: z.string().optional(),
  serviceZip: z.string().optional(),
  source: z.string().optional(),
  parentClientId: z.string().uuid().optional(),
  salesRepId: z.string().uuid().optional(),
  referredBy: z.string().optional(),
  referredByClientId: z.string().uuid().optional(),
  okToEmail: z.boolean().optional(),
  doNotMarket: z.boolean().optional(),
  smsOptIn: z
    .boolean()
    .optional()
    .describe(
      "Whether this client has consented to SMS. Setting it true records a consent timestamp and source alongside it — see smsOptInSource."
    ),
  // Under the approved A2P 10DLC campaign, an SMS opt-in is only defensible
  // with a record of WHEN it was given and HOW it was collected. Every other
  // path that flips sms_opt_in stamps both (the Twilio keyword webhook, form
  // submission, and useUpdateClient's manual toggle); this one silently
  // didn't, leaving an opt-in with no provenance at all. The route now
  // stamps sms_opt_in_at itself and takes the source from here.
  smsOptInSource: z
    .enum(SMS_OPT_IN_SOURCES)
    .optional()
    .describe(
      "How SMS consent was collected, recorded with the opt-in for A2P 10DLC compliance: 'form' (web form), 'verbal' (told a staff member), 'keyword' (texted START), 'manual' (entered by staff). Defaults to 'manual' when smsOptIn is set true without one."
    ),
  paymentMethod: z.string().optional(),
  billingTerms: z.string().optional(),
  invoiceFrequency: z.enum(INVOICE_FREQUENCIES).optional(),
  invoiceDelivery: z.enum(INVOICE_DELIVERIES).optional(),
  defaultTaxRateBps: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Default sales tax rate in BASIS POINTS (700 = 7%), not a percent."),
  defaultTerms: z.string().optional(),
  defaultPaymentMethod: z.string().optional(),
  isTaxable: z.boolean().optional(),
  gateCode: z.string().optional(),
  notesToCrew: z.string().optional(),
  mapCode: z.string().optional(),
  officeNotes: z.string().optional(),
  priority: z.enum(CLIENT_PRIORITIES).optional(),
  turfSqft: z.number().nonnegative().optional(),
  mulchBedSqft: z.number().nonnegative().optional(),
  grossSqft: z.number().nonnegative().optional(),
  linearFtPerimeter: z.number().nonnegative().optional(),
  linearFtEdging: z.number().nonnegative().optional(),
  yardsOfMulch: z.number().nonnegative().optional(),
};

export const createClientSchema = z.object(clientFields);

// parentClientId is create-only in the app too (linking/unlinking a parent
// later goes through a dedicated action, not a plain field patch).
//
// The nullable fields below are the ones backed by a nullable column, so a
// caller can actually CLEAR them — previously every PATCH field was
// `.optional()` and never `.nullable()`, which meant there was no way to
// unassign a sales rep, drop a referral link, or blank a note once set.
// displayName stays non-nullable: clients.display_name is NOT NULL.
export const updateClientSchema = z
  .object(clientFields)
  .omit({ parentClientId: true })
  .extend({
    displayName: z.string().min(1).optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    primaryPhone: z.string().nullable().optional(),
    primaryEmail: z.string().email().nullable().optional(),
    billingEmail: z.string().email().nullable().optional(),
    source: z.string().nullable().optional(),
    salesRepId: z.string().uuid().nullable().optional(),
    referredBy: z.string().nullable().optional(),
    referredByClientId: z.string().uuid().nullable().optional(),
    paymentMethod: z.string().nullable().optional(),
    billingTerms: z.string().nullable().optional(),
    invoiceFrequency: z.enum(INVOICE_FREQUENCIES).nullable().optional(),
    invoiceDelivery: z.enum(INVOICE_DELIVERIES).nullable().optional(),
    defaultTerms: z.string().nullable().optional(),
    defaultPaymentMethod: z.string().nullable().optional(),
    gateCode: z.string().nullable().optional(),
    notesToCrew: z.string().nullable().optional(),
    mapCode: z.string().nullable().optional(),
    officeNotes: z.string().nullable().optional(),
    priority: z.enum(CLIENT_PRIORITIES).nullable().optional(),
  });
