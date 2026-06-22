-- Extend crm_payments with SA-parity fields

alter table crm_payments
  alter column invoice_id drop not null,
  add column if not exists unused_amount_cents  integer not null default 0,
  add column if not exists refunded_amount_cents integer not null default 0,
  add column if not exists memo                 text,
  add column if not exists is_prepayment        boolean not null default false,
  add column if not exists deleted_at           timestamptz;

-- Normalize method column values to match new enum list
-- (existing data had 'check','cash','card','ach','other' — migrate to display strings)
update crm_payments set method = 'Check'         where lower(method) = 'check';
update crm_payments set method = 'Cash'          where lower(method) = 'cash';
update crm_payments set method = 'Credit Card- Visa' where lower(method) in ('card', 'credit card');
update crm_payments set method = 'ACH/E-Check'   where lower(method) = 'ach';
update crm_payments set method = 'Other'         where lower(method) = 'other';

-- Drop old check constraint and add updated one
alter table crm_payments drop constraint if exists crm_payments_method_check;
alter table crm_payments add constraint crm_payments_method_check
  check (method in (
    'ACH/E-Check','AR Write-off','AutoPay','Cash','Check',
    'Credit Card- AmEx','Credit Card- Discover','Credit Card- MasterCard',
    'Credit Card- Visa','Other'
  ));
