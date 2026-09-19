-- `clients.do_not_market` was carrying three unrelated meanings at once:
--
--   1. the client clicked unsubscribe (api/crm/unsubscribe/[token])
--   2. the office ticked "Do Not Market" by hand
--   3. the address HARD BOUNCED (api/webhooks/resend sets it on email.bounced)
--
-- (1) and (2) are a marketing preference. (3) is a deliverability fact, and it
-- is categorically different: a bounced address must never be emailed again
-- regardless of the message's purpose, while a marketing opt-out may still
-- legitimately receive a service notice about work the customer has already
-- contracted (CAN-SPAM governs commercial mail; transactional/relationship
-- mail is exempt).
--
-- Conflating them had two visible consequences on PROD:
--   * The bulk-email dialog reported "skipped (Do Not Market)" for a client
--     whose address had simply bounced — staff were shown a deliverability
--     failure as a customer preference. (The only do_not_market client in the
--     sandbox org was exactly this case: flagged by a bounce on 2026-09-15.)
--   * There was no safe way to offer an "include opted-out clients" override
--     for service notices, because it would also resurrect dead addresses and
--     damage sending-domain reputation.
--
-- Splitting the bounce out lets each sender pick the right rule:
--   marketing      → exclude do_not_market OR email_bounced_at
--   service notice → exclude email_bounced_at only
alter table public.clients
  add column if not exists email_bounced_at timestamptz;

comment on column public.clients.email_bounced_at is
  'Set when Resend reports a hard bounce for this client''s address. A deliverability fact, NOT a marketing preference — every sender must exclude these, including transactional/service mail. Marketing opt-out lives in do_not_market.';

-- Backfill from the bounce timestamps already recorded on client_activity by
-- the Resend webhook, so existing bounced addresses stay suppressed after the
-- webhook stops writing do_not_market.
update public.clients c
set email_bounced_at = b.bounced_at
from (
  select client_id, max(bounced_at) as bounced_at
  from public.client_activity
  where bounced_at is not null and client_id is not null
  group by client_id
) b
where b.client_id = c.id
  and c.email_bounced_at is null;

-- Deliberately NOT clearing do_not_market on backfilled rows. A bounce-derived
-- flag is indistinguishable from a genuine opt-out once written, and guessing
-- wrong would silently re-enrol someone who really did unsubscribe. Leaving it
-- set is the conservative outcome: those clients stay out of marketing, and
-- the new column is what keeps them out of service mail too. Clearing it for a
-- known bounce-only client is a data decision for the office to make.
create index if not exists idx_clients_email_bounced_at
  on public.clients (org_id)
  where email_bounced_at is not null;
