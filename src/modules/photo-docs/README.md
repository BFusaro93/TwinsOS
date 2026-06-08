# Photo Documentation Module

CompanyCam-style job-site photo management for Equipt. Field-ready, tied to existing Project (job) records.

---

## Setup

### 1. Apply database migrations

Run in order against your Supabase project (Dashboard → SQL Editor, or via CLI):

```bash
supabase db push --file supabase/migrations-photo-docs/001_add_photo_module_access.sql
supabase db push --file supabase/migrations-photo-docs/002_create_job_photos.sql
supabase db push --file supabase/migrations-photo-docs/003_create_photo_annotations.sql
supabase db push --file supabase/migrations-photo-docs/004_storage_policies.sql
```

### 2. Create Supabase Storage buckets

In the Supabase dashboard (Storage → New bucket) create two **private** buckets:

| Bucket name             | Public |
|-------------------------|--------|
| `job-photos-original`   | No     |
| `job-photos-annotated`  | No     |

Then apply the storage policies from migration `004_storage_policies.sql`.

### 3. Environment variables

No new env vars required — uses the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 4. Nav integration

The "Job Photos" nav item is already added to the sidebar under the **Field** section in `src/components/shared/nav-config.ts`. It only appears for users with `photo_module_access = true` (auto-granted to admins).

### 5. Grant access to users

Go to **Settings → Users** (admin only). Each user row now has a **Photo Module** toggle. Flip it on for any manager, technician, purchaser, or viewer who should see the module.

---

## Module structure

```
src/modules/photo-docs/
├── types/
│   └── photo.types.ts          # JobPhoto, PhotoAnnotation, BeforeAfterFlag, etc.
├── lib/
│   ├── imageCompression.ts     # Client-side <500 KB compression (browser-image-compression)
│   ├── photoStorage.ts         # Signed URL helpers, upload functions
│   └── annotationUtils.ts      # Fabric.js canvas helpers (SSR-safe)
├── hooks/
│   ├── usePhotoAccess.ts       # Role × flag permission matrix
│   ├── useJobPhotos.ts         # Fetch / delete / update photo records
│   ├── usePhotoUpload.ts       # Batch upload with per-file progress
│   └── useAnnotations.ts       # Fetch / save Fabric.js JSON + annotated composite
└── components/
    ├── PhotoModuleGuard.tsx    # Route-level access gate
    ├── PhotoGallery.tsx        # Manager/sales gallery with tabs, grid, lightbox
    ├── PhotoUploader.tsx       # Mobile-optimised batch uploader (camera capture)
    ├── PhotoLightbox.tsx       # Full-res lightbox with before/after badge, metadata
    ├── BeforeAfterSlider.tsx   # react-compare-slider paired before/after view
    ├── AnnotationEditor.tsx    # Fabric.js canvas — arrow, circle, text, freehand
    └── CrewPhotoView.tsx       # Simplified read-only + upload view for technicians

src/app/(dashboard)/jobs/
├── page.tsx                    # /jobs — job list (re-uses existing projects data)
├── JobsListPage.tsx
└── [jobId]/photos/
    ├── page.tsx                # /jobs/[jobId]/photos — gallery or crew view
    ├── upload/page.tsx         # /jobs/[jobId]/photos/upload
    └── [photoId]/annotate/page.tsx  # /jobs/[jobId]/photos/[photoId]/annotate

supabase/migrations-photo-docs/
├── 001_add_photo_module_access.sql
├── 002_create_job_photos.sql
├── 003_create_photo_annotations.sql
└── 004_storage_policies.sql
```

---

## Permission matrix

| Role       | Flag required | View | Upload | Annotate | Delete |
|------------|---------------|------|--------|----------|--------|
| admin      | auto-granted  | ✅   | ✅     | ✅       | ✅     |
| manager    | optional      | ✅   | ✅     | ✅       | ✅     |
| technician | optional      | ✅   | ✅     | ❌       | ❌     |
| purchaser  | optional      | ✅   | ❌     | ❌       | ❌     |
| viewer     | optional      | ✅   | ❌     | ❌       | ❌     |
| requestor  | N/A           | ❌   | ❌     | ❌       | ❌     |

---

## Key behaviours

- **Photos are linked to Projects** (existing `projects` table). The `/jobs` route is a view of projects.
- **Originals are never overwritten.** Annotations are saved as a separate Fabric.js JSON record and a separate annotated composite PNG.
- **All uploads are compressed to < 500 KB** client-side before hitting the network — important for field use on poor cell coverage.
- **GPS coordinates** are captured from the device's Geolocation API at upload time and stored on the photo record.
- **Crew view** is a simplified mobile layout shown when the current user has role `technician`. Upload button is fixed at the bottom for quick field use. Annotations are read-only.
- **Before/After slider** appears when a job has at least one Before and one After photo.

---

## Assumptions

1. **"Jobs" = Projects.** The existing `projects` table is used as the job entity. `projectId` == `jobId` throughout. The `/jobs` route is a dedicated photo-centric view of projects — it doesn't replace or modify the existing `/po/projects` route.
2. **No separate Customers table.** Customer info is denormalised onto the `projects` table as `customer_name`. The module surfaces this for display only.
3. **`photo_module_access` column is read by the frontend via the `profiles` select in `useUsers`.** The generated Supabase types (`src/types/supabase.ts`) should be regenerated after applying the migrations: `npx supabase gen types`.
4. **Storage bucket policies** in migration `004` use the `storage.policies` table syntax. Some Supabase versions require setting policies via the dashboard. If the SQL fails, set equivalent policies manually in Storage → Policies.
5. **Fabric.js v7** is loaded dynamically (client-side only) to avoid SSR issues. The canvas editor will not work without JavaScript.
