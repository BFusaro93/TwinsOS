-- Self-service "update your card" links.
--
-- A staff member / automation / emailed document mints a one-time link for a
-- client; the client opens /card-update/<token> (no login), saves a card on
-- file through Stripe, and can turn on AutoPay in the same step.
--
-- Only the SHA-256 of the token is stored — the token itself exists solely in
-- the emailed URL. Rows are written and read by the service role (the public
-- routes resolve token -> org/client server-side); staff get read-only
-- visibility of their own org's rows. Additive: safe before or after deploy.

create table if not exists public.card_update_tokens (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations(id),
  client_id   uuid        not null references public.clients(id),
  token_hash  text        not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid        references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint card_update_tokens_token_hash_key unique (token_hash)
);

comment on table public.card_update_tokens is
  'One-time self-service card-update links. token_hash = sha256(token) hex; the token is never stored. Service-role writes only.';

create index if not exists card_update_tokens_org_idx on public.card_update_tokens (org_id);
create index if not exists card_update_tokens_client_idx on public.card_update_tokens (client_id);

drop trigger if exists trg_card_update_tokens_updated_at on public.card_update_tokens;
create trigger trg_card_update_tokens_updated_at
  before update on public.card_update_tokens
  for each row execute function public.set_updated_at();

alter table public.card_update_tokens enable row level security;

drop policy if exists "org_staff_read_card_update_tokens" on public.card_update_tokens;
create policy "org_staff_read_card_update_tokens" on public.card_update_tokens
  for select using (
    org_id = public.my_org_id()
    and deleted_at is null
    and public.has_crm_access()
  );

revoke all on public.card_update_tokens from anon, public;
grant select on public.card_update_tokens to authenticated;
grant all on public.card_update_tokens to service_role;

notify pgrst, 'reload schema';
