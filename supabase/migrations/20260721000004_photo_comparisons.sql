-- Explicit before/after photo pairings, replacing the old approach of
-- matching "before"-tagged and "after"-tagged photos by array index (which
-- silently paired unrelated photos when a job had more than one of each).
-- A comparison links exactly one specific before photo to one specific
-- after photo, optionally labeled (e.g. "Front bed", "Retaining wall").
create table photo_comparisons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  photo_job_id uuid not null references photo_jobs(id),
  before_photo_id uuid not null references job_photos(id),
  after_photo_id uuid not null references job_photos(id),
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references profiles(id),
  constraint photo_comparisons_distinct_photos check (before_photo_id <> after_photo_id)
);

create index photo_comparisons_photo_job_id_idx on photo_comparisons(photo_job_id);

alter table photo_comparisons enable row level security;

create policy photo_comparisons_org_access on photo_comparisons
  for all
  using (org_id = (select org_id from profiles where id = auth.uid()));
