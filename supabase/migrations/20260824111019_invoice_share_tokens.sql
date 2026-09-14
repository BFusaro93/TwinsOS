-- Public, unauthenticated "view invoice online" + "pay without logging in"
-- links — mirrors estimate_share_tokens exactly. RLS only allows org
-- members (same as estimates); the public page/API routes read and write
-- through a service-role client, scoping every query themselves by the
-- token, never trusting a client-supplied invoice id.
create table if not exists invoice_share_tokens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  invoice_id  uuid not null references crm_invoices(id),
  token       uuid not null default gen_random_uuid(),
  expires_at  timestamptz,
  viewed_at   timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

create unique index if not exists invoice_share_tokens_token_idx on invoice_share_tokens(token);
create index if not exists invoice_share_tokens_invoice_idx on invoice_share_tokens(invoice_id);

alter table invoice_share_tokens enable row level security;

create policy "org members manage invoice share tokens"
  on invoice_share_tokens
  for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
