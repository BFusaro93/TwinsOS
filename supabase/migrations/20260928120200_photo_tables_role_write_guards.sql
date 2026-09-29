-- =============================================================================
-- Photo module tables: role-gated writes
--
-- job_photos / photo_annotations / photo_jobs / photo_comparisons each had a
-- single permissive ALL policy on org only, so ANY org member (viewer,
-- purchaser, users without photo_module_access) could create, rewrite or
-- hard-delete photo records via the API even though the UI (usePhotoAccess)
-- and the job-photos-* storage buckets restrict them.
--
-- Adds RESTRICTIVE per-command policies mirroring usePhotoAccess and the
-- storage bucket rules (org scoping stays with the existing ALL policy;
-- SELECT is unchanged):
--   uploader   = admin, crew, or manager/technician WITH photo_module_access
--   annotator  = admin, or manager WITH photo_module_access
--   deleter    = admin, or manager WITH photo_module_access
--
--   job_photos         INSERT uploader  | UPDATE admin + manager/technician w/ flag
--                      (crew only ever inserts — CrewPhotoView never edits)
--                      | DELETE deleter
--   photo_annotations  INSERT/UPDATE/DELETE annotator
--   photo_jobs         INSERT/UPDATE admin + manager/technician w/ flag
--                      (hidden from crew in the UI) | DELETE deleter
--   photo_comparisons  INSERT/UPDATE admin + manager/technician w/ flag | DELETE deleter
--
-- The app soft-deletes via UPDATE deleted_at, so the DELETE rule covers hard
-- deletes (API/direct) only. Safe to apply before or after the code deploy.
-- Idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.photo_role_allowed(p_roles text[], p_require_flag_for text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- true when the caller's profile role is in p_roles, and — for roles also
  -- listed in p_require_flag_for — photo_module_access is on.
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = any (p_roles)
      and (not (p.role = any (p_require_flag_for)) or coalesce(p.photo_module_access, false))
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.photo_role_allowed(text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.photo_role_allowed(text[], text[]) TO authenticated, service_role;

-- ── job_photos ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS job_photos_role_ins ON public.job_photos;
DROP POLICY IF EXISTS job_photos_role_upd ON public.job_photos;
DROP POLICY IF EXISTS job_photos_role_del ON public.job_photos;
CREATE POLICY job_photos_role_ins ON public.job_photos AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.photo_role_allowed(ARRAY['admin','crew','manager','technician'], ARRAY['manager','technician'])));
CREATE POLICY job_photos_role_upd ON public.job_photos AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.photo_role_allowed(ARRAY['admin','manager','technician'], ARRAY['manager','technician'])))
  WITH CHECK ((SELECT public.photo_role_allowed(ARRAY['admin','manager','technician'], ARRAY['manager','technician'])));
CREATE POLICY job_photos_role_del ON public.job_photos AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.photo_role_allowed(ARRAY['admin','manager'], ARRAY['manager'])));

-- ── photo_annotations ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS photo_annotations_role_ins ON public.photo_annotations;
DROP POLICY IF EXISTS photo_annotations_role_upd ON public.photo_annotations;
DROP POLICY IF EXISTS photo_annotations_role_del ON public.photo_annotations;
CREATE POLICY photo_annotations_role_ins ON public.photo_annotations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.photo_role_allowed(ARRAY['admin','manager'], ARRAY['manager'])));
CREATE POLICY photo_annotations_role_upd ON public.photo_annotations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.photo_role_allowed(ARRAY['admin','manager'], ARRAY['manager'])))
  WITH CHECK ((SELECT public.photo_role_allowed(ARRAY['admin','manager'], ARRAY['manager'])));
CREATE POLICY photo_annotations_role_del ON public.photo_annotations AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.photo_role_allowed(ARRAY['admin','manager'], ARRAY['manager'])));

-- ── photo_jobs ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS photo_jobs_role_ins ON public.photo_jobs;
DROP POLICY IF EXISTS photo_jobs_role_upd ON public.photo_jobs;
DROP POLICY IF EXISTS photo_jobs_role_del ON public.photo_jobs;
CREATE POLICY photo_jobs_role_ins ON public.photo_jobs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.photo_role_allowed(ARRAY['admin','manager','technician'], ARRAY['manager','technician'])));
CREATE POLICY photo_jobs_role_upd ON public.photo_jobs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.photo_role_allowed(ARRAY['admin','manager','technician'], ARRAY['manager','technician'])))
  WITH CHECK ((SELECT public.photo_role_allowed(ARRAY['admin','manager','technician'], ARRAY['manager','technician'])));
CREATE POLICY photo_jobs_role_del ON public.photo_jobs AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.photo_role_allowed(ARRAY['admin','manager'], ARRAY['manager'])));

-- ── photo_comparisons ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS photo_comparisons_role_ins ON public.photo_comparisons;
DROP POLICY IF EXISTS photo_comparisons_role_upd ON public.photo_comparisons;
DROP POLICY IF EXISTS photo_comparisons_role_del ON public.photo_comparisons;
CREATE POLICY photo_comparisons_role_ins ON public.photo_comparisons AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.photo_role_allowed(ARRAY['admin','manager','technician'], ARRAY['manager','technician'])));
CREATE POLICY photo_comparisons_role_upd ON public.photo_comparisons AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.photo_role_allowed(ARRAY['admin','manager','technician'], ARRAY['manager','technician'])))
  WITH CHECK ((SELECT public.photo_role_allowed(ARRAY['admin','manager','technician'], ARRAY['manager','technician'])));
CREATE POLICY photo_comparisons_role_del ON public.photo_comparisons AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.photo_role_allowed(ARRAY['admin','manager'], ARRAY['manager'])));
