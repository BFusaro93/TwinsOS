-- SECURITY FIX: storage.objects has two overlapping PERMISSIVE policy sets
-- for job-photos-original/job-photos-annotated. The correctly org-scoped
-- set (org_photo_originals_*/org_photo_annotated_*, added in
-- 20260824113952_photo_docs_storage_org_scope.sql) checks
-- (storage.foldername(name))[1] against the caller's org_id plus role/
-- photo_module_access. But an OLDER, unscoped set was still live —
-- "org members can read/upload/delete originals" and "org members can
-- read/upload/upsert annotated" — each checking only bucket_id, with no
-- org or path check at all. These came from
-- supabase/migrations-photo-docs/004_storage_policies.sql, a separate
-- migrations directory applied to the live DB but never reconciled with
-- the main supabase/migrations sequence (see
-- 20260721000003_photo_docs_backfill.sql's own comment about that folder).
--
-- Postgres RLS OR-combines multiple PERMISSIVE policies for the same
-- command, so the unscoped policies alone granted ANY authenticated user
-- of ANY org full SELECT/INSERT/UPDATE/DELETE on every org's job photos,
-- completely bypassing the org-scoped policies added later.
drop policy if exists "org members can read originals" on storage.objects;
drop policy if exists "org members can upload originals" on storage.objects;
drop policy if exists "org members can delete originals" on storage.objects;
drop policy if exists "org members can read annotated" on storage.objects;
drop policy if exists "org members can upload annotated" on storage.objects;
drop policy if exists "org members can upsert annotated" on storage.objects;
