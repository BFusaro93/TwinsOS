// Types for the View My Proposal portal (Sprint 3c)

export interface EstimateShareToken {
  id: string;
  orgId: string;
  estimateId: string;
  token: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  signatureData: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface EstimateEmail {
  id: string;
  orgId: string;
  estimateId: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  bodyHtml: string;
  sentAt: string;
  resendId: string | null;
  emailType: "estimate" | "confirmation";
}

export interface CRMEmailTemplate {
  id: string;
  orgId: string;
  name: string;
  subject: string;
  bodyHtml: string;
  templateType: "estimate" | "confirmation" | "invoice" | "chemical_application" | "general";
  isDefault: boolean;
  includePdf: boolean;
  createdAt: string;
  updatedAt: string;
}

// Merge tags supported in email templates
export const EMAIL_MERGE_TAGS = [
  { tag: "[clientfirstname]",  label: "Client First Name" },
  { tag: "[clientlastname]",   label: "Client Last Name" },
  { tag: "[clientfullname]",   label: "Client Full Name" },
  { tag: "[companyname]",      label: "Company Name" },
  { tag: "[quotelink]",        label: "View Proposal Link" },
  { tag: "[quotenumber]",      label: "Estimate Number" },
  { tag: "[quotedate]",        label: "Estimate Date" },
  { tag: "[quotetotal]",       label: "Estimate Total" },
  { tag: "[salesrepname]",     label: "Sales Rep Name" },
  { tag: "[companyphonenumber]", label: "Company Phone" },
] as const;

export type MergeTag = typeof EMAIL_MERGE_TAGS[number]["tag"];

// Merge tags supported in the Chemical Application Notice email template
export const CHEMICAL_EMAIL_MERGE_TAGS = [
  { tag: "[clientfirstname]",    label: "Client First Name" },
  { tag: "[clientfullname]",     label: "Client Full Name" },
  { tag: "[companyname]",        label: "Company Name" },
  { tag: "[applicationdate]",    label: "Application Date" },
  { tag: "[applicatorname]",     label: "Applicator Name" },
  { tag: "[applicatorlicense]",  label: "Applicator License #" },
  { tag: "[products]",           label: "Products Applied (name, EPA #, amount)" },
  { tag: "[conditions]",         label: "Weather Conditions" },
  { tag: "[careinstructions]",   label: "Post-Application Care Instructions" },
  { tag: "[companyphonenumber]", label: "Company Phone" },
] as const;

export type ChemicalMergeTag = typeof CHEMICAL_EMAIL_MERGE_TAGS[number]["tag"];

// Merge tags supported by the automation "Text Message" event's SMS body
// (resolveSmsStepContent in lib/automations/sequence-sms.ts) — that editor has
// no tag picker at all today, so authors type tags from memory; keep this in
// sync with that resolver's mergeTags map exactly.
export const SMS_EVENT_MERGE_TAGS = [
  { tag: "[clientfirstname]", label: "Client First Name" },
  { tag: "[clientfullname]",  label: "Client Full Name" },
  { tag: "[companyname]",     label: "Company Name" },
  { tag: "[meetingdate]",     label: "Meeting Date" },
  { tag: "[meetingtime]",     label: "Meeting Time" },
  { tag: "[meetinglocation]", label: "Meeting Location" },
] as const;

// Merge tags supported in general-purpose client email templates (Settings →
// Clients → Email Templates, used by the Dispatch Board / Waiting List bulk
// "Email Selected Clients" action) — must match buildClientMergeVars exactly,
// since that's the only resolver a plain client email (no estimate/invoice/
// application record) runs through.
export const GENERAL_EMAIL_MERGE_TAGS = [
  { tag: "[clientfirstname]",    label: "Client First Name" },
  { tag: "[clientlastname]",     label: "Client Last Name" },
  { tag: "[clientfullname]",     label: "Client Full Name" },
  { tag: "[companyname]",        label: "Company Name" },
  { tag: "[companyphonenumber]", label: "Company Phone" },
  { tag: "[accountbalance]",     label: "Account Balance" },
] as const;

export type GeneralMergeTag = typeof GENERAL_EMAIL_MERGE_TAGS[number]["tag"];

// Merge tags supported in the Send Invoice email template
export const INVOICE_EMAIL_MERGE_TAGS = [
  { tag: "[clientname]",         label: "Client Name" },
  { tag: "[clientfirstname]",    label: "Client First Name" },
  { tag: "[clientlastname]",     label: "Client Last Name" },
  { tag: "[clientfullname]",     label: "Client Full Name" },
  { tag: "[clientemail]",        label: "Client Email" },
  { tag: "[nameoninvoice]",      label: "Name on Invoice" },
  { tag: "[clientaccountbalance]", label: "Client Account Balance" },
  { tag: "[howwebillyou]",       label: "How We Bill You" },
  { tag: "[salesperson]",        label: "Sales Person" },
  { tag: "[referringclient]",    label: "Referring Client" },
  { tag: "[billingaddress1]",    label: "Billing Address" },
  { tag: "[billingcity]",        label: "Billing City" },
  { tag: "[billingstate]",       label: "Billing State" },
  { tag: "[billingzip]",         label: "Billing Zip" },
  { tag: "[companyname]",        label: "Company Name" },
  { tag: "[companyaddress]",     label: "Company Address" },
  { tag: "[companycity]",        label: "Company City" },
  { tag: "[companystate]",       label: "Company State" },
  { tag: "[companyzip]",         label: "Company Zip" },
  { tag: "[companyphonenumber]", label: "Company Phone" },
  { tag: "[invoicelogo]",        label: "Company Logo" },
  { tag: "[today]",              label: "Today's Date" },
  { tag: "[invoicenumber]",      label: "Invoice Number" },
  { tag: "[invoicedate]",        label: "Invoice Date" },
  { tag: "[duedate]",            label: "Due Date" },
  { tag: "[invoiceduedate]",     label: "Invoice Due Date" },
  { tag: "[invoicesubtotal]",    label: "Invoice Subtotal" },
  { tag: "[invoicetax]",         label: "Invoice Tax" },
  { tag: "[invoicetotal]",       label: "Invoice Total" },
  { tag: "[balancedue]",         label: "Balance Due" },
  { tag: "[invoicebalance]",     label: "Balance Due" },
  { tag: "[salesrepname]",       label: "Sales Rep Name" },
  { tag: "[viewinvoiceonline]",  label: "View Invoice Online Link" },
  { tag: "[paymentlink]",        label: "Pay Now Button" },
] as const;

export type InvoiceMergeTag = typeof INVOICE_EMAIL_MERGE_TAGS[number]["tag"];

import type { DisplaySettings } from "@/lib/estimate-display-settings";

// Public proposal data shape (returned by the proposal API, no auth required)
export interface ProposalData {
  estimateNumber: number;
  description: string | null;
  createdAt: string;
  validUntil: string | null;
  notes: string | null;
  stage: string;
  alreadyAccepted: boolean;
  acceptedAt: string | null;
  acceptedByName: string | null;

  clientName: string | null;

  orgName: string;
  orgPhone: string;
  orgBrandColor: string;
  orgLogoUrl: string | null;

  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  discountCents: number;
  /** Estimate-level discount rule; `percent` values are in bps of the subtotal. */
  discountType: "percent" | "flat" | null;
  discountValue: number | null;
  showDiscounts: boolean;
  totalCents: number;

  tiersEnabled: boolean;
  tierLabels: { basic: string; standard: string; premium: string };
  displaySettings: DisplaySettings;
  depositRequiredCents: number;
  depositCollectedCents: number;
  /** Set when the last deposit attempt was declined or returned by the bank.
   *  Non-null with depositCollectedCents 0 re-opens the link for a retry. */
  depositFailedCents: number | null;
  depositFailedReason: string | null;
  depositFailedMethod: "card" | "us_bank_account" | null;
  depositFailedAt: string | null;
  /** True when the deposit step can take a real card payment — the platform
   * has Stripe keys and this org has finished Connect onboarding. When false
   * the step falls back to the self-reported methods and Skip. */
  cardDepositAvailable: boolean;
  /** Whether the org offers bank transfer (ACH) for the deposit as well as
   * card. Org toggle only — the intent route verifies the connected account
   * really has the capability. */
  achDepositAvailable: boolean;
  /** The org's Connect mode, so Stripe.js is loaded with a matching
   * publishable key (see getScopedStripeJs). */
  orgLivemode: boolean;
  lineItems: ProposalLineItem[];
  photos: ProposalPhoto[];
}

export interface ProposalPhoto {
  id: string;
  caption: string | null;
  signedUrl: string | null;
}

export interface ProposalLineItem {
  id: string;
  rowType: "item" | "section";
  sectionName: string | null;
  serviceName: string | null;
  estimateDesc: string | null;
  qty: number;
  unitType: string | null;
  rateCents: number;
  visits: number;
  totalCents: number;
  status: string;
  tier: string | null;
}
