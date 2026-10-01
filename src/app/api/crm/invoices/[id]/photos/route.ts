import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { signPhotoPaths, type PhotoBucket } from "@/lib/invoices/photos";
import { heicToJpeg, isHeic, toJpgName, HEIC_MAX_BYTES, HEIC_ERROR_MESSAGE } from "@/lib/utils/convert-heic";
import {
  INVOICE_PHOTO_LIMIT,
  attachInvoicePhotosSchema,
  patchInvoicePhotosSchema,
  deleteInvoicePhotosSchema,
  type InvoicePhoto,
  type InvoicePhotoCandidate,
  type InvoicePhotoSource,
} from "@/types/invoice-photos";

const log = logger.child("invoice-photos-api");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
const CANDIDATE_CAP = 120;

// Renderable-in-PDF/gallery image extensions. HEIC/HEIF are excluded on purpose:
// they cannot be rendered outside Safari (new uploads are converted to JPEG).
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

/** True when a stored photo is a still image we can show. mime wins; else extension. */
function isImageMedia(mime: string | null | undefined, nameOrPath: string | null | undefined): boolean {
  const m = (mime ?? "").toLowerCase();
  if (m) {
    if (m === "image/heic" || m === "image/heif") return false;
    return m.startsWith("image/");
  }
  return IMAGE_EXT.test(nameOrPath ?? "");
}
const SIGN_TTL = 3600;

type Ctx = { params: Promise<{ id: string }> };

interface Auth {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  orgId: string;
}

async function authorize(mode: "read" | "write"): Promise<Auth | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // org_id always comes from the session's profile, never the request.
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same granular gates as the invoice edit / email routes: admins always
  // pass. Managing photos is part of editing or sending an invoice.
  const keys = mode === "read"
    ? ["acct_view_invoice_list", "acct_add_modify_invoices", "acct_send_invoices"]
    : ["acct_add_modify_invoices", "acct_send_invoices"];
  let allowed = false;
  for (const key of keys) {
    const { data, error } = await (supabase.rpc as any)("has_settings_permission", { p_key: key });
    if (error) {
      log.error("has_settings_permission failed", { key, error: error.message });
      return NextResponse.json({ error: "Permission check failed" }, { status: 500 });
    }
    if (data) { allowed = true; break; }
  }
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return { supabase, userId: user.id, orgId: profile.org_id as string };
}

function isErr(x: Auth | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}

async function loadInvoice(a: Auth, invoiceId: string) {
  const { data, error } = await (a.supabase as any)
    .from("crm_invoices")
    .select("id, org_id, client_id, crm_job_id, project_id, clients(display_name), crm_invoice_line_items(visit_id)")
    .eq("id", invoiceId)
    .eq("org_id", a.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    log.error("invoice load failed", { invoiceId, error: error.message });
    return { error: NextResponse.json({ error: "Failed to load invoice" }, { status: 500 }) };
  }
  if (!data) return { error: NextResponse.json({ error: "Invoice not found" }, { status: 404 }) };
  return { invoice: data as Row };
}

async function listAttached(a: Auth, invoiceId: string): Promise<{ rows: Row[] } | { error: NextResponse }> {
  const { data, error } = await (a.supabase as any)
    .from("invoice_photos")
    .select("*")
    .eq("invoice_id", invoiceId)
    .eq("org_id", a.orgId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    log.error("list attached failed", { invoiceId, error: error.message });
    return { error: NextResponse.json({ error: "Failed to load photos" }, { status: 500 }) };
  }
  return { rows: (data ?? []) as Row[] };
}

function toPhoto(row: Row, urls: Map<string, string>): InvoicePhoto {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    source: row.source as InvoicePhotoSource,
    sourceId: row.source_id ?? null,
    caption: row.caption ?? null,
    fileName: row.file_name ?? "",
    sortOrder: row.sort_order ?? 0,
    signedUrl: urls.get(`${row.bucket}:${row.storage_path}`) ?? null,
  };
}

/** Escape a user search term for use inside a PostgREST .or() ilike filter. */
function safeLike(term: string): string {
  return term.replace(/[%_,()\\*]/g, " ").trim().slice(0, 80);
}

// ── GET ──────────────────────────────────────────────────────────────────────
// ?candidates=1        also return photos that could be attached
// ?search=<text>       additionally match photo jobs by customer / job NAME
//                      (photo jobs only have an optional client_id link; many
//                      were created with just a free-text customer_name)
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await authorize("read");
  if (isErr(a)) return a;
  const { id: invoiceId } = await params;

  const inv = await loadInvoice(a, invoiceId);
  if ("error" in inv) return inv.error;

  const attachedRes = await listAttached(a, invoiceId);
  if ("error" in attachedRes) return attachedRes.error;

  const service = createServiceClient() as unknown as SupabaseClient;
  const attachedUrls = await signPhotoPaths(
    service,
    attachedRes.rows.filter((r) => r.storage_path.startsWith(`${a.orgId}/`)).map((r) => ({ bucket: r.bucket as PhotoBucket, path: r.storage_path })),
    SIGN_TTL
  );
  const attached = attachedRes.rows.map((r) => toPhoto(r, attachedUrls));
  const clientName = (inv.invoice.clients?.display_name as string | undefined) ?? null;

  if (req.nextUrl.searchParams.get("candidates") !== "1") {
    return NextResponse.json({ attached, candidates: [], clientName });
  }

  const search = safeLike(req.nextUrl.searchParams.get("search") ?? "");
  const cands = await buildCandidates(a, inv.invoice, search, attachedRes.rows);
  if ("error" in cands) return cands.error;

  const signed = await signPhotoPaths(service, cands.items.map((c) => ({ bucket: c.bucket, path: c.path })), SIGN_TTL);
  const candidates: InvoicePhotoCandidate[] = cands.items.map((c) => ({
    source: c.source,
    sourceId: c.sourceId,
    groupLabel: c.groupLabel,
    caption: c.caption,
    takenAt: c.takenAt,
    signedUrl: signed.get(`${c.bucket}:${c.path}`) ?? null,
    alreadyAttached: c.alreadyAttached,
    match: c.match,
  }));
  return NextResponse.json({ attached, candidates, clientName });
}

interface CandidateItem {
  source: "job_photo" | "visit_photo";
  sourceId: string;
  groupLabel: string;
  caption: string | null;
  takenAt: string | null;
  bucket: PhotoBucket;
  path: string;
  alreadyAttached: boolean;
  match: "linked" | "name_search";
}

async function buildCandidates(
  a: Auth,
  invoice: Row,
  search: string,
  attachedRows: Row[]
): Promise<{ items: CandidateItem[] } | { error: NextResponse }> {
  const db = a.supabase as any;
  const orgPrefix = `${a.orgId}/`;
  const attachedKeys = new Set(attachedRows.filter((r) => r.source_id).map((r) => `${r.source}:${r.source_id}`));
  const items: CandidateItem[] = [];

  // ── Visit photos: the invoice's billed visits (line item visit_id), plus
  //    any visit of the invoice's job(s).
  const visitIds = ((invoice.crm_invoice_line_items ?? []) as Row[]).map((li) => li.visit_id as string | null).filter((v): v is string => !!v);
  const jobIds = new Set<string>();
  if (invoice.crm_job_id) jobIds.add(invoice.crm_job_id as string);

  const visitMeta = new Map<string, Row>();
  if (visitIds.length > 0) {
    const { data, error } = await db
      .from("crm_job_visits")
      .select("id, job_id, scheduled_date")
      .in("id", visitIds)
      .eq("org_id", a.orgId);
    if (error) {
      log.error("visit lookup failed", { error: error.message });
      return { error: NextResponse.json({ error: "Failed to load visits" }, { status: 500 }) };
    }
    for (const v of (data ?? []) as Row[]) {
      visitMeta.set(v.id, v);
      if (v.job_id) jobIds.add(v.job_id);
    }
  }

  const visitFilters: string[] = [];
  if (visitIds.length > 0) visitFilters.push(`visit_id.in.(${visitIds.join(",")})`);
  if (jobIds.size > 0) visitFilters.push(`job_id.in.(${[...jobIds].join(",")})`);
  if (visitFilters.length > 0) {
    const { data, error } = await db
      .from("crm_visit_photos")
      .select("id, visit_id, job_id, storage_path, caption, created_at")
      .eq("org_id", a.orgId)
      .or(visitFilters.join(","))
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_CAP);
    if (error) {
      log.error("visit photos lookup failed", { error: error.message });
      return { error: NextResponse.json({ error: "Failed to load visit photos" }, { status: 500 }) };
    }
    const missingVisitIds = [...new Set(((data ?? []) as Row[]).map((p) => p.visit_id as string).filter((v) => !visitMeta.has(v)))];
    if (missingVisitIds.length > 0) {
      const { data: vm } = await db.from("crm_job_visits").select("id, job_id, scheduled_date").in("id", missingVisitIds).eq("org_id", a.orgId);
      for (const v of (vm ?? []) as Row[]) visitMeta.set(v.id, v);
    }
    for (const p of (data ?? []) as Row[]) {
      // Legacy rows used a visit-photos/{orgId}/ layout; never sign a path
      // outside this org's own folder.
      if (typeof p.storage_path !== "string" || !p.storage_path.startsWith(orgPrefix)) continue;
      if (!isImageMedia(null, p.storage_path)) continue;
      const date = visitMeta.get(p.visit_id)?.scheduled_date as string | undefined;
      items.push({
        source: "visit_photo",
        sourceId: p.id,
        groupLabel: date ? `Visit ${date}` : "Visit",
        caption: p.caption ?? null,
        takenAt: p.created_at ?? null,
        bucket: "attachments",
        path: p.storage_path,
        alreadyAttached: attachedKeys.has(`visit_photo:${p.id}`),
        match: "linked",
      });
    }
  }

  // ── Job photos (photo-docs module). A photo job links to a CRM client
  //    (photo_jobs.client_id) and/or a project (photo_jobs.project_id).
  const projectIds = new Set<string>();
  if (invoice.project_id) projectIds.add(invoice.project_id as string);
  if (jobIds.size > 0) {
    const { data: jobs } = await db.from("crm_jobs").select("id, project_id").in("id", [...jobIds]).eq("org_id", a.orgId);
    for (const j of (jobs ?? []) as Row[]) if (j.project_id) projectIds.add(j.project_id);
  }

  const linkFilters: string[] = [];
  if (invoice.client_id) linkFilters.push(`client_id.eq.${invoice.client_id}`);
  if (projectIds.size > 0) linkFilters.push(`project_id.in.(${[...projectIds].join(",")})`);

  const photoJobs = new Map<string, { name: string; match: "linked" | "name_search" }>();
  if (linkFilters.length > 0) {
    const { data, error } = await db
      .from("photo_jobs")
      .select("id, name")
      .eq("org_id", a.orgId)
      .is("deleted_at", null)
      .or(linkFilters.join(","))
      .limit(50);
    if (error) {
      log.error("photo_jobs link lookup failed", { error: error.message });
      return { error: NextResponse.json({ error: "Failed to load job photos" }, { status: 500 }) };
    }
    for (const j of (data ?? []) as Row[]) photoJobs.set(j.id, { name: j.name, match: "linked" });
  }
  if (search) {
    const { data, error } = await db
      .from("photo_jobs")
      .select("id, name, customer_name")
      .eq("org_id", a.orgId)
      .is("deleted_at", null)
      .or(`customer_name.ilike.%${search}%,name.ilike.%${search}%`)
      .limit(50);
    if (error) {
      log.error("photo_jobs name search failed", { error: error.message });
      return { error: NextResponse.json({ error: "Failed to search job photos" }, { status: 500 }) };
    }
    for (const j of (data ?? []) as Row[]) {
      if (!photoJobs.has(j.id)) photoJobs.set(j.id, { name: j.name, match: "name_search" });
    }
  }

  if (photoJobs.size > 0) {
    const { data, error } = await db
      .from("job_photos")
      .select("id, photo_job_id, storage_path, annotated_path, has_annotations, file_name, display_name, mime_type, created_at")
      .eq("org_id", a.orgId)
      .in("photo_job_id", [...photoJobs.keys()])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_CAP);
    if (error) {
      log.error("job photos lookup failed", { error: error.message });
      return { error: NextResponse.json({ error: "Failed to load job photos" }, { status: 500 }) };
    }
    for (const p of (data ?? []) as Row[]) {
      if (!isImageMedia(p.mime_type, p.file_name ?? p.storage_path)) continue;
      const useAnnotated = !!(p.has_annotations && p.annotated_path);
      const path = (useAnnotated ? p.annotated_path : p.storage_path) as string | null;
      if (!path || !path.startsWith(orgPrefix)) continue;
      const pj = photoJobs.get(p.photo_job_id)!;
      items.push({
        source: "job_photo",
        sourceId: p.id,
        groupLabel: pj.name,
        caption: (p.display_name as string | null) ?? null,
        takenAt: p.created_at ?? null,
        bucket: useAnnotated ? "job-photos-annotated" : "job-photos-original",
        path,
        alreadyAttached: attachedKeys.has(`job_photo:${p.id}`),
        match: pj.match,
      });
    }
  }
  return { items };
}

// ── POST ─────────────────────────────────────────────────────────────────────
// JSON  -> attach existing job / visit photos by source row id
// multipart/form-data (file[, caption]) -> direct upload on the invoice
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await authorize("write");
  if (isErr(a)) return a;
  const { id: invoiceId } = await params;

  const inv = await loadInvoice(a, invoiceId);
  if ("error" in inv) return inv.error;

  const existing = await listAttached(a, invoiceId);
  if ("error" in existing) return existing.error;
  const nextSort = existing.rows.reduce((m, r) => Math.max(m, (r.sort_order as number) ?? 0), -1) + 1;
  const room = INVOICE_PHOTO_LIMIT - existing.rows.length;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return handleUpload(req, a, invoiceId, nextSort, room);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = attachInvoicePhotosSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const already = new Set(existing.rows.filter((r) => r.source_id).map((r) => `${r.source}:${r.source_id}`));
  const wanted = parsed.data.photos.filter((p, i, arr) =>
    !already.has(`${p.source}:${p.sourceId}`) && arr.findIndex((q) => q.source === p.source && q.sourceId === p.sourceId) === i
  );
  if (wanted.length === 0) return NextResponse.json({ attached: [] }, { status: 200 });
  if (wanted.length > room) {
    return NextResponse.json({ error: `An invoice can include at most ${INVOICE_PHOTO_LIMIT} photos` }, { status: 409 });
  }

  const db = a.supabase as any;
  const orgPrefix = `${a.orgId}/`;
  const rows: Row[] = [];

  const visitIds = wanted.filter((w) => w.source === "visit_photo").map((w) => w.sourceId);
  const jobPhotoIds = wanted.filter((w) => w.source === "job_photo").map((w) => w.sourceId);
  const visitMap = new Map<string, Row>();
  const jobMap = new Map<string, Row>();
  if (visitIds.length > 0) {
    const { data, error } = await db.from("crm_visit_photos").select("id, storage_path, caption").eq("org_id", a.orgId).in("id", visitIds);
    if (error) return NextResponse.json({ error: "Failed to load visit photos" }, { status: 500 });
    for (const r of (data ?? []) as Row[]) visitMap.set(r.id, r);
  }
  if (jobPhotoIds.length > 0) {
    const { data, error } = await db
      .from("job_photos")
      .select("id, storage_path, annotated_path, has_annotations, file_name, display_name, mime_type")
      .eq("org_id", a.orgId).is("deleted_at", null).in("id", jobPhotoIds);
    if (error) return NextResponse.json({ error: "Failed to load job photos" }, { status: 500 });
    for (const r of (data ?? []) as Row[]) jobMap.set(r.id, r);
  }

  let sort = nextSort;
  for (const w of wanted) {
    let bucket: PhotoBucket;
    let path: string | null;
    let fileName = "";
    let mime: string | null = null;
    let srcCaption: string | null = null;
    if (w.source === "visit_photo") {
      const r = visitMap.get(w.sourceId);
      if (!r) return NextResponse.json({ error: "Visit photo not found" }, { status: 404 });
      if (!isImageMedia(null, r.storage_path)) {
        return NextResponse.json({ error: "Only images can be attached to an invoice (videos and PDFs are not supported)" }, { status: 422 });
      }
      bucket = "attachments"; path = r.storage_path; srcCaption = r.caption ?? null;
    } else {
      const r = jobMap.get(w.sourceId);
      if (!r) return NextResponse.json({ error: "Job photo not found" }, { status: 404 });
      if (!isImageMedia(r.mime_type, r.file_name ?? r.storage_path)) {
        return NextResponse.json({ error: `"${r.file_name ?? "That file"}" is not a photo (videos, PDFs and HEIC files cannot be attached to an invoice)` }, { status: 422 });
      }
      const useAnnotated = !!(r.has_annotations && r.annotated_path);
      bucket = useAnnotated ? "job-photos-annotated" : "job-photos-original";
      path = useAnnotated ? r.annotated_path : r.storage_path;
      fileName = r.file_name ?? "";
      mime = useAnnotated ? "image/png" : (r.mime_type ?? null);
      srcCaption = r.display_name ?? null;
    }
    if (!path || !path.startsWith(orgPrefix)) {
      return NextResponse.json({ error: "That photo's file is stored outside this organization's folder and cannot be attached" }, { status: 422 });
    }
    rows.push({
      org_id: a.orgId,
      invoice_id: invoiceId,
      source: w.source,
      source_id: w.sourceId,
      bucket,
      storage_path: path,
      file_name: fileName,
      mime_type: mime,
      caption: (w.caption ?? srcCaption) || null,
      sort_order: sort++,
      created_by: a.userId,
    });
  }

  const { data, error } = await db.from("invoice_photos").insert(rows).select("*");
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A selected photo is already attached" }, { status: 409 });
    log.error("attach insert failed", { invoiceId, error: error.message });
    return NextResponse.json({ error: "Failed to attach photos" }, { status: 500 });
  }
  return NextResponse.json({ attached: data }, { status: 201 });
}

async function handleUpload(req: NextRequest, a: Auth, invoiceId: string, nextSort: number, room: number) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const caption = typeof form.get("caption") === "string" ? (form.get("caption") as string).trim().slice(0, 300) : "";
  if (files.length === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (files.length > room) {
    return NextResponse.json({ error: `An invoice can include at most ${INVOICE_PHOTO_LIMIT} photos` }, { status: 409 });
  }
  for (const f of files) {
    const heic = isHeic(f);
    if (!heic && !UPLOAD_MIME[f.type]) return NextResponse.json({ error: "Only JPEG, PNG or HEIC images can be attached to an invoice" }, { status: 400 });
    if (f.size > (heic ? HEIC_MAX_BYTES : MAX_UPLOAD_BYTES)) {
      return NextResponse.json({ error: `Each photo must be ${heic ? 15 : 10}MB or smaller` }, { status: 400 });
    }
  }
  // Convert every HEIC up front so a failure stores nothing.
  const prepared: { buf: Buffer<ArrayBufferLike>; type: string; ext: string; name: string }[] = [];
  for (const file of files) {
    let buf: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer());
    if (isHeic(file)) {
      try { buf = await heicToJpeg(buf); } catch (e) {
        log.warn("heic conversion failed", { invoiceId, error: e instanceof Error ? e.message : String(e) });
        return NextResponse.json({ error: HEIC_ERROR_MESSAGE }, { status: 422 });
      }
      prepared.push({ buf, type: "image/jpeg", ext: "jpg", name: toJpgName(file.name) });
    } else {
      prepared.push({ buf, type: file.type, ext: UPLOAD_MIME[file.type], name: file.name });
    }
  }

  // The attachments bucket's INSERT policy requires the org id as the FIRST
  // path segment, and reads need an attachments row — so, like the estimate
  // and visit photo routes, storage goes through the service client after the
  // caller has been authorized and the path is built from the session org.
  const storage = createServiceClient().storage.from("attachments");
  const inserted: Row[] = [];
  let sort = nextSort;
  for (const file of prepared) {
    const ext = file.ext;
    const path = `${a.orgId}/invoice-photos/${invoiceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await storage.upload(path, file.buf, { contentType: file.type, upsert: false });
    if (upErr) {
      log.error("invoice photo upload failed", { invoiceId, error: upErr.message });
      return NextResponse.json({ error: "Upload failed", attached: inserted }, { status: 500 });
    }
    const { data, error } = await (a.supabase as any)
      .from("invoice_photos")
      .insert({
        org_id: a.orgId, invoice_id: invoiceId, source: "upload", source_id: null,
        bucket: "attachments", storage_path: path, file_name: file.name.slice(0, 200),
        mime_type: file.type, caption: caption || null, sort_order: sort++, created_by: a.userId,
      })
      .select("*")
      .single();
    if (error) {
      log.error("invoice photo insert failed", { invoiceId, error: error.message });
      // Don't orphan the object we just wrote.
      const { error: rmErr } = await storage.remove([path]);
      if (rmErr) log.warn("orphan cleanup failed", { path, error: rmErr.message });
      return NextResponse.json({ error: "Failed to save photo", attached: inserted }, { status: 500 });
    }
    inserted.push(data as Row);
  }
  return NextResponse.json({ attached: inserted }, { status: 201 });
}

// ── PATCH: captions / ordering ───────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("write");
  if (isErr(a)) return a;
  const { id: invoiceId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = patchInvoicePhotosSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  for (const u of parsed.data.updates) {
    const patch: Row = {};
    if (u.caption !== undefined) patch.caption = u.caption || null;
    if (u.sortOrder !== undefined) patch.sort_order = u.sortOrder;
    if (Object.keys(patch).length === 0) continue;
    const { data, error } = await (a.supabase as any)
      .from("invoice_photos")
      .update(patch)
      .eq("id", u.id)
      .eq("invoice_id", invoiceId)
      .eq("org_id", a.orgId)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      log.error("photo patch failed", { invoiceId, error: error.message });
      return NextResponse.json({ error: "Failed to update photo" }, { status: 500 });
    }
    if (!data || data.length === 0) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// ── DELETE: soft detach ──────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = await authorize("write");
  if (isErr(a)) return a;
  const { id: invoiceId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = deleteInvoicePhotosSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  // Soft delete only. The storage object is left alone: for job/visit photos
  // it still belongs to the originating record.
  const { error } = await (a.supabase as any)
    .from("invoice_photos")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", parsed.data.ids)
    .eq("invoice_id", invoiceId)
    .eq("org_id", a.orgId)
    .is("deleted_at", null);
  if (error) {
    log.error("photo delete failed", { invoiceId, error: error.message });
    return NextResponse.json({ error: "Failed to remove photos" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
