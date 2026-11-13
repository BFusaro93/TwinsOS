import type { DisplaySettings } from "@/lib/estimate-display-settings";
export type DocType = "client" | "estimate" | "invoice_email" | "marketing" | "chemical" | "chemical_recommendation" | "chemical_upsell" | "text_message" | "snow_email" | "snow_text";
export type DocStatus = "active" | "inactive";
export type BlockType =
  | "header"
  | "paragraph"
  | "list"
  | "divider"
  | "spacer"
  | "line_items"
  | "signature"
  | "image"
  | "button"
  | "columns"
  | "estimate_grid";

export type ConfirmationRecipient = "primary_email" | "billing_email";

export interface DocumentTemplate {
  id: string;
  orgId: string;
  name: string;
  docType: DocType;
  description: string | null;
  subject: string | null;
  status: DocStatus;
  isDefault: boolean;
  includePdf: boolean;
  /** Estimate docs only: Client-type document used as the estimate email. */
  estimateEmailDocumentId: string | null;
  /** Estimate docs only: Client-type document sent when the proposal is accepted. */
  confirmationDocumentId: string | null;
  confirmationRecipient: ConfirmationRecipient;
  /** Estimate docs only: attach the estimate PDF to the confirmation email. */
  confirmationIncludeEstimatePdf: boolean;
  /** Estimate docs only: client-facing display toggles copied onto an estimate that picks this document. null = none set. */
  displaySettings: DisplaySettings | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentBlock {
  id: string;
  templateId: string;
  orgId: string;
  blockType: BlockType;
  orderIndex: number;
  content: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentTemplateWithBlocks extends DocumentTemplate {
  blocks: DocumentBlock[];
}

// Merge tag catalog
export interface MergeTag {
  tag: string;
  label: string;
  group: string;
}

// ── Client tags ───────────────────────────────────────────────────────────────

// Every tag below has a real column (or computed value) behind it via
// buildClientMergeVars (src/lib/email/send.ts). Tags that were here but had
// no data source as the schema stands today — [contacttitle], [nameoninvoice],
// [csr], [creditcardending]/[creditcardexpiration] (no raw card data is
// stored anywhere; Stripe holds it), [billingaddress2]/[physicaladdress2],
// the multi-property fields ([propertyname], [masterproperty], [subproperty],
// [parkinglot sqft], [condounits] — that's the `client_properties` model,
// which this resolver doesn't join), [companyemail]/[companywebsite]/
// [signatureline], the logo tags (images, not a text substitution), and the
// form/portal/opt-in links (marketing-flow-specific, not a generic client
// email) — were removed rather than left to blank-degrade silently.
const CLIENT_TAGS: MergeTag[] = [
  { tag: "[clientname]",          label: "Client Name",              group: "Client" },
  { tag: "[clientfirstname]",     label: "Client First Name",        group: "Client" },
  { tag: "[clientlastname]",      label: "Client Last Name",         group: "Client" },
  { tag: "[clientemail]",         label: "Client Email",             group: "Client" },
  { tag: "[clienthomephone]",     label: "Client Home Phone",        group: "Client" },
  { tag: "[clientworkphone]",     label: "Client Work Phone",        group: "Client" },
  { tag: "[clientcellphone]",     label: "Client Cell Phone",        group: "Client" },
  { tag: "[clientotherphone]",    label: "Client Other Phone",       group: "Client" },
  { tag: "[clientfax]",           label: "Client Fax",               group: "Client" },
  { tag: "[accountnumber]",       label: "Account Number",           group: "Client" },
  { tag: "[clientaccountbalance]",label: "Client Account Balance",   group: "Client" },
  { tag: "[howwebillyou]",        label: "How We Bill You",          group: "Client" },
  { tag: "[salesperson]",         label: "Sales Person",             group: "Client" },
  { tag: "[referringclient]",     label: "Referring Client",         group: "Client" },
];

// ── Billing address tags ───────────────────────────────────────────────────────

const BILLING_TAGS: MergeTag[] = [
  { tag: "[billingaddress1]",     label: "Billing Address 1",        group: "Billing Address" },
  { tag: "[billingcity]",         label: "Billing City",             group: "Billing Address" },
  { tag: "[billingstate]",        label: "Billing State",            group: "Billing Address" },
  { tag: "[billingzip]",          label: "Billing Zip",              group: "Billing Address" },
];

// ── Property / service address tags ───────────────────────────────────────────

const PROPERTY_TAGS: MergeTag[] = [
  { tag: "[physicaladdress1]",    label: "Physical Address 1",       group: "Property" },
  { tag: "[physicalcity]",        label: "Physical City",            group: "Property" },
  { tag: "[physicalstate]",       label: "Physical State",           group: "Property" },
  { tag: "[physicalzip]",         label: "Physical Zip",             group: "Property" },
  { tag: "[turfsqft]",            label: "Turf Sq. Ft.",             group: "Property" },
  { tag: "[grosssqft]",           label: "Gross Sq. Ft.",            group: "Property" },
  { tag: "[mulchbedsqft]",        label: "Mulch Bed Sq. Ft.",        group: "Property" },
  { tag: "[yardsofmulch]",        label: "Yards of Mulch",           group: "Property" },
  { tag: "[linearfeetperimeter]", label: "Linear Feet of Perimeter", group: "Property" },
  { tag: "[linearfeetedging]",    label: "Linear Feet of Edging",    group: "Property" },
  { tag: "[gatecode]",            label: "Gate / Lock Code",         group: "Property" },
  { tag: "[notestocrew]",         label: "Notes to Crew",            group: "Property" },
];

// ── Company tags ──────────────────────────────────────────────────────────────

const COMPANY_TAGS: MergeTag[] = [
  { tag: "[companyname]",         label: "Company Name",             group: "Company" },
  { tag: "[companyaddress]",      label: "Company Address",          group: "Company" },
  { tag: "[companycity]",         label: "Company City",             group: "Company" },
  { tag: "[companystate]",        label: "Company State",            group: "Company" },
  { tag: "[companyzip]",          label: "Company Zip",              group: "Company" },
  { tag: "[companyphone]",        label: "Company Phone",            group: "Company" },
];

// ── System / link tags ────────────────────────────────────────────────────────

const SYSTEM_TAGS: MergeTag[] = [
  { tag: "[today]",               label: "Today's Date",             group: "System" },
];

// ── Estimate tags ─────────────────────────────────────────────────────────────

const ESTIMATE_TAGS: MergeTag[] = [
  { tag: "[estimatenumber]",              label: "Estimate Number",                group: "Estimate" },
  { tag: "[estimatecode]",                label: "Estimate Code",                  group: "Estimate" },
  { tag: "[estimatedate]",                label: "Estimate Date",                  group: "Estimate" },
  { tag: "[estimatevaliduntil]",          label: "Estimate Valid Until",           group: "Estimate" },
  { tag: "[estimatesubtotal]",            label: "Estimate Subtotal",              group: "Estimate" },
  { tag: "[estimatetotal]",               label: "Estimate Total",                 group: "Estimate" },
  { tag: "[estimatetotallessdiscounts]",  label: "Estimate Total Less Discounts",  group: "Estimate" },
  { tag: "[estimatediscountpct]",         label: "Estimate Discount %",            group: "Estimate" },
  { tag: "[estimatediscountamt]",         label: "Estimate Discount Amount",       group: "Estimate" },
  { tag: "[estimatenotes]",               label: "Estimate Notes",                 group: "Estimate" },
  { tag: "[estimatelink]",                label: "Estimate Link",                  group: "Estimate" },
  { tag: "[estimatelinkurl]",             label: "Estimate Link URL",              group: "Estimate" },
  { tag: "[installmentcount]",            label: "# of Installments",             group: "Estimate" },
  { tag: "[installmentamount]",           label: "Installment Amount",             group: "Estimate" },
  { tag: "[estimategrid]",                label: "Estimate Line Items",            group: "Estimate" },
];

// ── Invoice tags ──────────────────────────────────────────────────────────────

const INVOICE_TAGS: MergeTag[] = [
  { tag: "[invoicenumber]",       label: "Invoice Number",           group: "Invoice" },
  { tag: "[invoicedate]",         label: "Invoice Date",             group: "Invoice" },
  { tag: "[invoiceduedate]",      label: "Invoice Due Date",         group: "Invoice" },
  { tag: "[invoiceterms]",        label: "Invoice Terms (e.g. Net 30)", group: "Invoice" },
  { tag: "[invoicesubtotal]",     label: "Invoice Subtotal",         group: "Invoice" },
  { tag: "[invoicetax]",          label: "Invoice Tax",              group: "Invoice" },
  { tag: "[invoicetotal]",        label: "Invoice Total",            group: "Invoice" },
  { tag: "[invoicebalance]",      label: "Balance Due",              group: "Invoice" },
  { tag: "[paymentlink]",         label: "Payment Link",             group: "Invoice" },
  { tag: "[viewinvoiceonline]",   label: "Invoice Online Link (URL)", group: "Invoice" },
  { tag: "[invoicegrid]",         label: "Invoice Line Items",       group: "Invoice" },
];

// ── Chemical application tags ─────────────────────────────────────────────────

const CHEMICAL_TAGS: MergeTag[] = [
  { tag: "[applicationdate]",   label: "Application Date",                          group: "Chemical" },
  { tag: "[applicatorname]",    label: "Applicator Name",                           group: "Chemical" },
  { tag: "[applicatorlicense]", label: "Applicator License #",                      group: "Chemical" },
  { tag: "[products]",          label: "Products Applied (name, EPA #, amount)",    group: "Chemical" },
  { tag: "[conditions]",        label: "Weather Conditions",                        group: "Chemical" },
  { tag: "[careinstructions]",  label: "Post-Application Care Instructions",        group: "Chemical" },
  { tag: "[chemicalnotice]",    label: "Full Notice of Treatment (leave-behind)",   group: "Chemical" },
];

// ── Snow tags ─────────────────────────────────────────────────────────────────
// Filled from the client's snow stop (storm event + visit) — by the snow board's
// compose dialog per recipient, and by automations from the client's most recent
// snow visit (src/lib/automations/snow-extras.ts). Elsewhere they resolve blank.

export const SNOW_TAGS: MergeTag[] = [
  { tag: "[stormname]",     label: "Storm Name",                          group: "Snow" },
  { tag: "[stormdate]",     label: "Storm Date",                          group: "Snow" },
  { tag: "[snowservice]",   label: "Snow Service (e.g. Plow, Walks)",     group: "Snow" },
  { tag: "[snowcrew]",      label: "Crew Name",                           group: "Snow" },
  { tag: "[snowstatus]",    label: "Status wording (e.g. on our way)",    group: "Snow" },
  { tag: "[snowarrival]",   label: "Arrival time (if scheduled)",         group: "Snow" },
  { tag: "[snowaddress]",   label: "Service Address of the stop",         group: "Snow" },
];

// ── Shared base (all doc types) ───────────────────────────────────────────────

const COMMON = [...CLIENT_TAGS, ...BILLING_TAGS, ...PROPERTY_TAGS, ...COMPANY_TAGS, ...SYSTEM_TAGS];

export const MERGE_TAGS_BY_TYPE: Record<DocType, MergeTag[]> = {
  // Client documents are also the Estimate Email / Confirmation Email bodies (an
  // Estimate document links to them), so the estimate tags must be reachable here.
  // They resolve only when the document is sent from an estimate.
  client:        [...COMMON, ...ESTIMATE_TAGS],
  marketing:     COMMON,
  estimate:      [...COMMON, ...ESTIMATE_TAGS],
  invoice_email: [...COMMON, ...INVOICE_TAGS],
  chemical:      [...COMMON, ...CHEMICAL_TAGS],
  chemical_recommendation: [...COMMON, ...CHEMICAL_TAGS],
  chemical_upsell:         [...COMMON, ...CHEMICAL_TAGS],
  text_message:  COMMON,
  snow_email:    [...COMMON, ...SNOW_TAGS],
  snow_text:     [...COMMON, ...SNOW_TAGS],
};

/**
 * Where a Button block can point, per document type. `value` is stored on the
 * block as `settings.href` and resolved at send time like any merge tag, so
 * only tags every send route for that type actually fills in belong here.
 * Any type can also use a custom URL.
 */
export const BUTTON_LINK_OPTIONS: Partial<Record<DocType, { value: string; label: string }[]>> = {
  client:        [{ value: "[estimatelinkurl]", label: "View proposal (estimate emails only)" }],
  invoice_email: [{ value: "[viewinvoiceonline]", label: "View & pay invoice online" }],
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  client:        "Client",
  estimate:      "Estimate",
  invoice_email: "Invoice Email",
  marketing:     "Marketing",
  chemical:      "Chemical – Client Instruction",
  chemical_recommendation: "Chemical – Recommendation",
  chemical_upsell:         "Chemical – Upsale",
  text_message:  "Text Message",
  snow_email:    "Snow – Email",
  snow_text:     "Snow – Text Message",
};

/** Doc types sent as SMS — no subject line, no rich formatting/blocks beyond plain text. */
export const PLAIN_TEXT_DOC_TYPES: DocType[] = ["text_message", "snow_text"];

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  header:     "Header",
  paragraph:  "Paragraph",
  list:       "List",
  divider:    "Divider",
  spacer:     "Spacer",
  line_items: "Line Items Table",
  signature:  "Signature",
  image:      "Image",
  button:     "Button",
  columns:    "Columns",
  estimate_grid: "Estimate Grid",
};
