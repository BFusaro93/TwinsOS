export type DocType = "client" | "estimate" | "invoice_email" | "marketing";
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
  | "button";

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

const CLIENT_TAGS: MergeTag[] = [
  { tag: "[clientname]",          label: "Client Name",              group: "Client" },
  { tag: "[clientfirstname]",     label: "Client First Name",        group: "Client" },
  { tag: "[clientlastname]",      label: "Client Last Name",         group: "Client" },
  { tag: "[contacttitle]",        label: "Contact Title",            group: "Client" },
  { tag: "[clientemail]",         label: "Client Email",             group: "Client" },
  { tag: "[clienthomephone]",     label: "Client Home Phone",        group: "Client" },
  { tag: "[clientworkphone]",     label: "Client Work Phone",        group: "Client" },
  { tag: "[clientcellphone]",     label: "Client Cell Phone",        group: "Client" },
  { tag: "[clientotherphone]",    label: "Client Other Phone",       group: "Client" },
  { tag: "[clientfax]",           label: "Client Fax",               group: "Client" },
  { tag: "[nameoninvoice]",       label: "Name on Invoice",          group: "Client" },
  { tag: "[accountnumber]",       label: "Account Number",           group: "Client" },
  { tag: "[clientaccountbalance]",label: "Client Account Balance",   group: "Client" },
  { tag: "[howwebillyou]",        label: "How We Bill You",          group: "Client" },
  { tag: "[salesperson]",         label: "Sales Person",             group: "Client" },
  { tag: "[csr]",                 label: "CSR",                      group: "Client" },
  { tag: "[referringclient]",     label: "Referring Client",         group: "Client" },
  { tag: "[creditcardending]",    label: "Credit Card Ending In",    group: "Client" },
  { tag: "[creditcardexpiration]",label: "Credit Card Expiration",   group: "Client" },
];

// ── Billing address tags ───────────────────────────────────────────────────────

const BILLING_TAGS: MergeTag[] = [
  { tag: "[billingaddress1]",     label: "Billing Address 1",        group: "Billing Address" },
  { tag: "[billingaddress2]",     label: "Billing Address 2",        group: "Billing Address" },
  { tag: "[billingcity]",         label: "Billing City",             group: "Billing Address" },
  { tag: "[billingstate]",        label: "Billing State",            group: "Billing Address" },
  { tag: "[billingzip]",          label: "Billing Zip",              group: "Billing Address" },
];

// ── Property / service address tags ───────────────────────────────────────────

const PROPERTY_TAGS: MergeTag[] = [
  { tag: "[propertyname]",        label: "Property Name",            group: "Property" },
  { tag: "[masterproperty]",      label: "Master Property",          group: "Property" },
  { tag: "[subproperty]",         label: "Subproperty",              group: "Property" },
  { tag: "[physicaladdress1]",    label: "Physical Address 1",       group: "Property" },
  { tag: "[physicaladdress2]",    label: "Physical Address 2",       group: "Property" },
  { tag: "[physicalcity]",        label: "Physical City",            group: "Property" },
  { tag: "[physicalstate]",       label: "Physical State",           group: "Property" },
  { tag: "[physicalzip]",         label: "Physical Zip",             group: "Property" },
  { tag: "[turfsqft]",            label: "Turf Sq. Ft.",             group: "Property" },
  { tag: "[grosssqft]",           label: "Gross Sq. Ft.",            group: "Property" },
  { tag: "[mulchbedsqft]",        label: "Mulch Bed Sq. Ft.",        group: "Property" },
  { tag: "[yardsofmulch]",        label: "Yards of Mulch",           group: "Property" },
  { tag: "[parkinglot sqft]",     label: "Parking Lot Sq. Ft.",      group: "Property" },
  { tag: "[linearfeetperimeter]", label: "Linear Feet of Perimeter", group: "Property" },
  { tag: "[linearfeetedging]",    label: "Linear Feet of Edging",    group: "Property" },
  { tag: "[condounits]",          label: "Condominium Units",        group: "Property" },
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
  { tag: "[companyemail]",        label: "Company Email",            group: "Company" },
  { tag: "[companywebsite]",      label: "Company Website",          group: "Company" },
  { tag: "[invoicelogo]",         label: "Invoice Logo",             group: "Company" },
  { tag: "[estimatelogo]",        label: "Company Logo (Estimates)", group: "Company" },
  { tag: "[signatureline]",       label: "Signature Line",           group: "Company" },
];

// ── System / link tags ────────────────────────────────────────────────────────

const SYSTEM_TAGS: MergeTag[] = [
  { tag: "[today]",               label: "Today's Date",             group: "System" },
  { tag: "[formurl]",             label: "Form URL",                 group: "System" },
  { tag: "[formlink]",            label: "Form Link",                group: "System" },
  { tag: "[optinlink]",           label: "Default Opt-In Link",      group: "System" },
  { tag: "[optoutlink]",          label: "Default Opt-Out Link",     group: "System" },
  { tag: "[clientportallink]",    label: "Client Portal Link",       group: "System" },
  { tag: "[clientportalsignup]",  label: "Client Portal Signup",     group: "System" },
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
  { tag: "[invoicesubtotal]",     label: "Invoice Subtotal",         group: "Invoice" },
  { tag: "[invoicetax]",          label: "Invoice Tax",              group: "Invoice" },
  { tag: "[invoicetotal]",        label: "Invoice Total",            group: "Invoice" },
  { tag: "[invoicebalance]",      label: "Balance Due",              group: "Invoice" },
  { tag: "[paymentlink]",         label: "Payment Link",             group: "Invoice" },
  { tag: "[invoicegrid]",         label: "Invoice Line Items",       group: "Invoice" },
];

// ── Shared base (all doc types) ───────────────────────────────────────────────

const COMMON = [...CLIENT_TAGS, ...BILLING_TAGS, ...PROPERTY_TAGS, ...COMPANY_TAGS, ...SYSTEM_TAGS];

export const MERGE_TAGS_BY_TYPE: Record<DocType, MergeTag[]> = {
  client:        COMMON,
  marketing:     COMMON,
  estimate:      [...COMMON, ...ESTIMATE_TAGS],
  invoice_email: [...COMMON, ...INVOICE_TAGS],
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  client:        "Client",
  estimate:      "Estimate",
  invoice_email: "Invoice Email",
  marketing:     "Marketing",
};

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
};
