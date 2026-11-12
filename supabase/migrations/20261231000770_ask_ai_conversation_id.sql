-- Group Ask AI questions by conversation.
--
-- Every message in the widget was logged as its own row with nothing tying a
-- chat's follow-ups together, so one conversation showed up as several
-- unrelated items in the staff review tab. The widget now sends one
-- conversation_id per open chat (it resets when the panel closes) and the staff
-- list returns it so the tab can group rows. Existing rows stay NULL and show
-- as single-question conversations.

alter table public.ask_ai_questions
  add column if not exists conversation_id uuid;

create index if not exists ask_ai_questions_conversation_idx
  on public.ask_ai_questions (conversation_id) where conversation_id is not null;

-- The returned column set changes, so the function must be dropped first.
drop function if exists public.staff_list_ask_ai_questions();

create function public.staff_list_ask_ai_questions()
returns table(
  id uuid, org_id uuid, org_name text, question text, answer text, outcome text,
  source_titles text[], model text, escalated_at timestamptz, status text,
  resolution text, resolved_at timestamptz, created_at timestamptz,
  asker_name text, asker_email text, conversation_id uuid
)
language sql stable security definer set search_path = public as $$
  select q.id, q.org_id, o.name, q.question, q.answer, q.outcome,
         q.source_titles, q.model, q.escalated_at, q.status,
         q.resolution, q.resolved_at, q.created_at,
         p.name, p.email, q.conversation_id
    from public.ask_ai_questions q
    left join public.organizations o on o.id = q.org_id
    left join public.profiles p on p.id = q.created_by
   where public.is_staff(auth.uid())
     and q.deleted_at is null
   order by q.created_at desc
   limit 1000;
$$;

revoke all on function public.staff_list_ask_ai_questions() from public, anon;
grant execute on function public.staff_list_ask_ai_questions() to authenticated;
