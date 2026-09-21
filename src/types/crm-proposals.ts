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

// Merge tags supported in email templates
export const EMAIL_MERGE_TAGS = [
  { tag: "[clientfirstname]",  label: "Client First Name" },
  { tag: "[clientlastname]",   label: "Client Last Name" },
  { tag: "[clientfullname]",   label: "Client Full Name" },
  { tag: "[companyname]",      label: "Company Name" },
  { tag: "[estimatelink]",     label: "View Proposal Link" },
  { tag: "[estimatenumber]",   label: "Estimate Number" },
  { tag: "[estimatedate]",     label: "Estimate Date" },
  { tag: "[estimatetotal]",    label: "Estimate Total" },
  { tag: "[installmentcount]",  label: "# of Installments" },
  { tag: "[installmentamount]", label: "Installment Amount" },
  { tag: "[estimategrid]",     label: "Line Items Table" },
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

// Merge tags supported in general-purpose client email templates (Settings →
// Clients → Email Templates, used by the Dispatch Board / Waiting List bulk
// "Email Selected Clients" action) — must match buildClientMergeVars exactly,
// since that's the only resolver a plain client email (no estimate/invoice/
// application record) runs through.
export const GENERAL_EMAIL_MERGE_TAGS = [
  { tag: "[clientfirstname]",    label: "Client First Name" },
  { tag: "[clientlastname]",     label: "Client Last Name" },
  { tag: "[clientfullname]",     label: "Client Full Name" },
  { tag: "[clientemail]",        label: "Client Email" },
  { tag: "[clienthomephone]",    label: "Client Home Phone" },
  { tag: "[clientworkphone]",    label: "Client Work Phone" },
  { tag: "[clientcellphone]",    label: "Client Cell Phone" },
  { tag: "[clientotherphone]",   label: "Client Other Phone" },
  { tag: "[clientfax]",          label: "Client Fax" },
  { tag: "[accountnumber]",      label: "Account Number" },
  { tag: "[accountbalance]",     label: "Account Balance" },
  { tag: "[howwebillyou]",       label: "How We Bill You" },
  { tag: "[salesperson]",        label: "Sales Person" },
  { tag: "[referringclient]",    label: "Referring Client" },
  { tag: "[billingaddress1]",    label: "Billing Address" },
  { tag: "[billingcity]",        label: "Billing City" },
  { tag: "[billingstate]",       label: "Billing State" },
  { tag: "[billingzip]",         label: "Billing Zip" },
  { tag: "[physicaladdress1]",   label: "Property Address" },
  { tag: "[physicalcity]",       label: "Property City" },
  { tag: "[physicalstate]",      label: "Property State" },
  { tag: "[physicalzip]",        label: "Property Zip" },
  { tag: "[turfsqft]",           label: "Turf Sq. Ft." },
  { tag: "[grosssqft]",          label: "Gross Sq. Ft." },
  { tag: "[mulchbedsqft]",       label: "Mulch Bed Sq. Ft." },
  { tag: "[yardsofmulch]",       label: "Yards of Mulch" },
  { tag: "[linearfeetperimeter]",label: "Linear Feet of Perimeter" },
  { tag: "[linearfeetedging]",   label: "Linear Feet of Edging" },
  { tag: "[gatecode]",           label: "Gate / Lock Code" },
  { tag: "[notestocrew]",        label: "Notes to Crew" },
  { tag: "[companyname]",        label: "Company Name" },
  { tag: "[companyaddress]",     label: "Company Address" },
  { tag: "[companycity]",        label: "Company City" },
  { tag: "[companystate]",       label: "Company State" },
  { tag: "[companyzip]",         label: "Company Zip" },
  { tag: "[companyphonenumber]", label: "Company Phone" },
  { tag: "[today]",              label: "Today's Date" },
] as const;

export type GeneralMergeTag = typeof GENERAL_EMAIL_MERGE_TAGS[number]["tag"];

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
  /** Materials/equipment/subcontract rows. Always part of the price — the
   *  client cannot deselect them — and already included in subtotalCents. */
  directCosts: ProposalDirectCost[];
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

export interface ProposalDirectCost {
  id: string;
  description: string;
  qty: number;
  rateCents: number;
  totalCents: number;
}
