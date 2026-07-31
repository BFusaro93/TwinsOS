-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill migration: profiles.photo_module_access, job_photos, and
-- photo_annotations were all created directly against prod (see
-- supabase/migrations-photo-docs/, which was never wired into the tracked
-- migrations this repo/CLI actually applies), so test never got them —
-- breaking any migration that references job_photos (e.g. photo_comparisons)
-- and making the whole photo-docs module unreproducible from a fresh env.
-- Reconstructed from prod's live schema (information_schema/pg_constraint/
-- pg_policies), not from the stale draft files in migrations-photo-docs/.
-- CREATE/ADD/DROP+CREATE POLICY ... IF NOT EXISTS so this is a no-op on prod
-- and only actually applies on test/any fresh env.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_module_access boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.job_photos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES public.organizations(id),
  photo_job_id      uuid        NOT NULL REFERENCES public.photo_jobs(id),
  uploaded_by       uuid        NOT NULL REFERENCES public.profiles(id),
  uploaded_by_name  text        NOT NULL,
  storage_path      text        NOT NULL,
  annotated_path    text,
  thumbnail_path    text,
  file_name         text        NOT NULL,
  file_size         integer     NOT NULL,
  mime_type         text        NOT NULL,
  width             integer,
  height            integer,
  before_after      text        NOT NULL DEFAULT 'none'
                      CHECK (before_after IN ('before', 'during', 'after', 'none')),
  tags              text[]      NOT NULL DEFAULT '{}',
  notes             text,
  gps_lat           double precision,
  gps_lng           double precision,
  upload_context    text        NOT NULL DEFAULT 'other'
                      CHECK (upload_context IN ('site_documentation', 'progress', 'completion', 'other')),
  has_annotations   boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  created_by        uuid        REFERENCES public.profiles(id),
  display_name      text
);

CREATE INDEX IF NOT EXISTS job_photos_org_id_idx        ON public.job_photos(org_id)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS job_photos_photo_job_id_idx  ON public.job_photos(photo_job_id)  WHERE deleted_at IS NULL;

ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_photos_org_access" ON public.job_photos;
CREATE POLICY "job_photos_org_access"
  ON public.job_photos
  FOR ALL
  USING (org_id = (SELECT profiles.org_id FROM public.profiles WHERE profiles.id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.photo_annotations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id),
  photo_id    uuid        NOT NULL REFERENCES public.job_photos(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES public.profiles(id),
  author_name text        NOT NULL,
  fabric_json jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS photo_annotations_photo_unique ON public.photo_annotations(photo_id);

ALTER TABLE public.photo_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photo_annotations_org_access" ON public.photo_annotations;
CREATE POLICY "photo_annotations_org_access"
  ON public.photo_annotations
  FOR ALL
  USING (org_id = (SELECT profiles.org_id FROM public.profiles WHERE profiles.id = auth.uid()));

-- Storage buckets (private — signed URLs only, per repo convention)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('job-photos-original',  'job-photos-original',  false, 524288000),
  ('job-photos-annotated', 'job-photos-annotated', false, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "org members can read originals" ON storage.objects;
CREATE POLICY "org members can read originals"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'job-photos-original');

DROP POLICY IF EXISTS "org members can upload originals" ON storage.objects;
CREATE POLICY "org members can upload originals"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'job-photos-original');

DROP POLICY IF EXISTS "org members can delete originals" ON storage.objects;
CREATE POLICY "org members can delete originals"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'job-photos-original');

DROP POLICY IF EXISTS "org members can read annotated" ON storage.objects;
CREATE POLICY "org members can read annotated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'job-photos-annotated');

DROP POLICY IF EXISTS "org members can upload annotated" ON storage.objects;
CREATE POLICY "org members can upload annotated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'job-photos-annotated');

DROP POLICY IF EXISTS "org members can upsert annotated" ON storage.objects;
CREATE POLICY "org members can upsert annotated"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'job-photos-annotated');
