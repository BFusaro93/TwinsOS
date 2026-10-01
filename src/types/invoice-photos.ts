import { z } from "zod";

export const INVOICE_PHOTO_SOURCES = ["job_photo", "visit_photo", "upload"] as const;
export type InvoicePhotoSource = (typeof INVOICE_PHOTO_SOURCES)[number];

/** Max photos embedded in an invoice PDF / shown on the online page. */
export const INVOICE_PHOTO_LIMIT = 12;

/** POST (JSON): attach existing job / visit photos by their source row ids. */
export const attachInvoicePhotosSchema = z.object({
  photos: z
    .array(
      z.object({
        source: z.enum(["job_photo", "visit_photo"]),
        sourceId: z.string().uuid(),
        caption: z.string().trim().max(300).nullish(),
      })
    )
    .min(1)
    .max(INVOICE_PHOTO_LIMIT),
});

/** PATCH: edit caption and/or sort order of one or many attached photos. */
export const patchInvoicePhotosSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        caption: z.string().trim().max(300).nullish(),
        sortOrder: z.number().int().min(0).max(10000).optional(),
      })
    )
    .min(1)
    .max(100),
});

/** DELETE (soft): detach one or many photos from the invoice. */
export const deleteInvoicePhotosSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export interface InvoicePhoto {
  id: string;
  invoiceId: string;
  source: InvoicePhotoSource;
  sourceId: string | null;
  caption: string | null;
  fileName: string;
  sortOrder: number;
  signedUrl: string | null;
}

export interface InvoicePhotoCandidate {
  source: "job_photo" | "visit_photo";
  sourceId: string;
  /** Group label, e.g. the photo job name or visit date. */
  groupLabel: string;
  caption: string | null;
  takenAt: string | null;
  signedUrl: string | null;
  alreadyAttached: boolean;
  /** How it was matched: via the invoice's own links, or by a name search. */
  match: "linked" | "name_search";
}

export interface InvoicePhotosResponse {
  attached: InvoicePhoto[];
  candidates: InvoicePhotoCandidate[];
  clientName: string | null;
}
