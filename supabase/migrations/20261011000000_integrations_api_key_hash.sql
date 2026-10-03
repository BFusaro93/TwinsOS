-- Hash the Zapier integration API key (like api_keys.key_hash).
-- Adds api_key_hash (sha256 hex) + api_key_prefix to integrations. Plaintext
-- api_key is KEPT here for transitional lookup and for providers (Samsara)
-- whose credential must be retrievable. Clearing Zapier plaintext is in
-- 20261011000100_zapier_clear_plaintext_key.sql (apply after code deploy).
alter table public.integrations
  add column if not exists api_key_hash text,
  add column if not exists api_key_prefix text;

-- Built-in sha256() (PG11+); no pgcrypto dependency.
update public.integrations
   set api_key_hash = encode(sha256(convert_to(api_key, 'utf8')), 'hex'),
       api_key_prefix = left(api_key, 12)
 where provider = 'zapier'
   and api_key is not null and api_key <> ''
   and api_key_hash is null;

create unique index if not exists integrations_api_key_hash_uidx
  on public.integrations (api_key_hash) where api_key_hash is not null;
