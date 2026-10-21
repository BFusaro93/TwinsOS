-- Ask AI question log.
--
-- Every question asked in the in-app Ask AI widget is recorded with the AI's
-- reply and how well the help docs covered it (full / partial / none, as
-- self-reported by the model — see src/app/api/support/ask/route.ts). The
-- staff-only "Ask AI" tab under /internal reviews the ones the docs could not
-- fully answer, and staff can write a resolution that is fed back into Ask AI
-- as extra knowledge, so the same question is answered without an email next
-- time.
--
-- Written only by the server (service role) and read/triaged only through the
-- staff RPCs below, so RLS is enabled with no policy for authenticated users:
-- an org member cannot read another member's questions, or their own.

create table if not exists public.ask_ai_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default my_org_id() references public.organizations(id),
  created_by uuid references public.profiles(id),
  question text not null,
  answer text,
  -- pending: reply still streaming (or the stream died before finishing).
  -- unknown: the model reply carried no coverage marker.
  outcome text not null default 'pending'
    check (outcome in ('pending', 'full', 'partial', 'none', 'unknown', 'error')),
  source_titles text[] not null default '{}',
  model text,
  -- Set when the user pressed "Send this conversation to support".
  escalated_at timestamptz,
  status text not null default 'new' check (status in ('new', 'resolved', 'ignored')),
  -- Staff-written answer, injected into Ask AI's context while status = 'resolved'.
  resolution text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists ask_ai_questions_org_idx on public.ask_ai_questions (org_id);
create index if not exists ask_ai_questions_triage_idx
  on public.ask_ai_questions (status, outcome, created_at desc) where deleted_at is null;

alter table public.ask_ai_questions enable row level security;

create or replace function public.staff_list_ask_ai_questions()
returns table(
  id uuid, org_id uuid, org_name text, question text, answer text, outcome text,
  source_titles text[], model text, escalated_at timestamptz, status text,
  resolution text, resolved_at timestamptz, created_at timestamptz,
  asker_name text, asker_email text
)
language sql stable security definer set search_path = public as $$
  select q.id, q.org_id, o.name, q.question, q.answer, q.outcome,
         q.source_titles, q.model, q.escalated_at, q.status,
         q.resolution, q.resolved_at, q.created_at,
         p.name, p.email
    from public.ask_ai_questions q
    left join public.organizations o on o.id = q.org_id
    left join public.profiles p on p.id = q.created_by
   where public.is_staff(auth.uid())
     and q.deleted_at is null
   order by q.created_at desc
   limit 1000;
$$;

create or replace function public.staff_resolve_ask_ai_question(
  p_id uuid, p_status text, p_resolution text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if p_status not in ('new', 'resolved', 'ignored') then
    raise exception 'Invalid status';
  end if;
  if p_status = 'resolved' and coalesce(btrim(p_resolution), '') = '' then
    raise exception 'A resolution is required to mark a question resolved';
  end if;

  update public.ask_ai_questions
     set status = p_status,
         resolution = case when p_status = 'resolved' then btrim(p_resolution) else resolution end,
         resolved_by = case when p_status = 'new' then null else auth.uid() end,
         resolved_at = case when p_status = 'new' then null else now() end,
         updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.staff_list_ask_ai_questions() from public, anon;
revoke all on function public.staff_resolve_ask_ai_question(uuid, text, text) from public, anon;
grant execute on function public.staff_list_ask_ai_questions() to authenticated;
grant execute on function public.staff_resolve_ask_ai_question(uuid, text, text) to authenticated;
