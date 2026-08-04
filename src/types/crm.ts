export type ClientStatus = 'active' | 'inactive' | 'lead' | 'cancelled' | 'lost';
export type AccountType = 'residential' | 'commercial';
export type InvoiceFrequency = 'daily' | 'weekly' | 'monthly' | 'upon_completion';
export type InvoiceDelivery = 'email' | 'print' | 'both';
export type ActivityType =
  | 'note'
  | 'call'
  | 'email'
  | 'invoice'
  | 'payment'
  | 'job'
  | 'job_visit'
  | 'estimate'
  | 'contract'
  | 'automation'
  | 'ticket';

export interface PropertyZone {
  name: string;
  type: 'turf' | 'mulch_bed' | 'parking_lot' | 'other';
  sqft: number;
  notes?: string;
  /** Traced polygon vertices from the aerial measurement tool, if this zone was drawn on the map. */
  path?: { lat: number; lng: number }[];
}

export interface Client {
  id: string;
  orgId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  accountNumber: string | null;
  accountType: AccountType;
  status: ClientStatus;
  primaryPhone: string | null;
  phones: ContactPhone[];
  primaryEmail: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  billingCountry: string;
  billingEmail: string | null;
  invoiceFrequency: InvoiceFrequency;
  defaultTaxRateBps: number;
  defaultTerms: string;
  invoiceDelivery: InvoiceDelivery;
  paymentMethod: string | null;
  billingTerms: string | null;
  isTaxable: boolean;
  salesTaxCode: string | null;
  salesRepId: string | null;
  salesRepName: string | null;
  source: string | null;
  referredBy: string | null;
  referredByClientId: string | null;
  clientSince: string | null;
  turfSqft: number | null;
  mulchBedSqft: number | null;
  grossSqft: number | null;
  linearFtPerimeter: number | null;
  linearFtEdging: number | null;
  yardsOfMulch: number | null;
  serviceAddress: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceZip: string | null;
  billingSameAsService: boolean;
  gateCode: string | null;
  notesToCrew: string | null;
  mapCode: string | null;
  priority: 'low' | 'normal' | 'high' | null;
  okToEmail: boolean;
  balanceOutstandingCents: number;
  balanceUninvoicedCents: number;
  balanceCreditsCents: number;
  balancePrepaymentsCents: number;
  defaultPaymentMethod: string | null;
  officeNotes: string | null;
  cancellationReason: string | null;
  revenuePotentialCents: number;
  doNotMarket: boolean;
  closedAt: string | null;
  parentClientId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  // joined
  tags?: string[];
  contacts?: ClientContact[];
  properties?: ClientProperty[];
  subClientCount?: number;
}

export interface ClientProperty {
  id: string;
  orgId: string;
  clientId: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  turfSqft: number | null;
  mulchBedSqft: number | null;
  grossSqft: number | null;
  linearFtPerimeter: number | null;
  linearFtEdging: number | null;
  yardsOfMulch: number | null;
  parkingLotSqft: number | null;
  zones: PropertyZone[];
  gateCode: string | null;
  notesToCrew: string | null;
  mapCode: string | null;
  isMaster: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientContact {
  id: string;
  orgId: string;
  clientId: string;
  firstName: string;
  lastName: string | null;
  contactType: string | null;
  phones: ContactPhone[];
  // legacy single-phone fields — kept for backwards compat on old records
  phone: string | null;
  phoneType: string | null;
  email: string | null;
  isPrimary: boolean;
  okToEmail: boolean;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export type PhoneType = "cell" | "home" | "work" | "fax" | "other";

export interface ContactPhone {
  phone: string;
  type: PhoneType;
  isPrimary: boolean;
}

export interface ClientActivity {
  id: string;
  orgId: string;
  clientId: string;
  activityType: ActivityType;
  subject: string | null;
  body: string | null;
  amountCents: number | null;
  status: string | null;
  refId: string | null;
  refTable: string | null;
  sentTo: string | null;
  deliveredAt: string | null;
  occurredAt: string;
  createdAt: string;
  createdBy: string | null;
  // joined
  createdByName?: string | null;
}

// ── form schemas ──────────────────────────────────────────────────────────────

export interface NewClientFormValues {
  displayName: string;
  accountType: AccountType;
  primaryPhone: string;
  primaryEmail: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  source: string;
  salesRepId: string;
}
