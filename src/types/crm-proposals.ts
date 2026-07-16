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
  templateType: "estimate" | "confirmation" | "invoice" | "chemical_application";
  isDefault: boolean;
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
  totalCents: number;

  tiersEnabled: boolean;
  tierLabels: { basic: string; standard: string; premium: string };
  depositRequiredCents: number;
  depositCollectedCents: number;
  lineItems: ProposalLineItem[];
}

export interface ProposalLineItem {
  id: string;
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
