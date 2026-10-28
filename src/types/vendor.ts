import { BaseRecord } from "./common";

export type W9Status = "not_requested" | "requested" | "received" | "expired";

export interface Vendor extends BaseRecord {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  /** Street line. City, state and zip are their own fields. */
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string | null;
  notes: string | null;
  vendorType: string | null;
  isActive: boolean;
  w9Status: W9Status;
  w9ReceivedDate: string | null; // ISO date
  w9ExpirationDate: string | null; // ISO date
}
