-- Debit cards were recorded as "Credit Card- <brand>". Stripe reports card funding
-- (credit/debit/prepaid) on the charge, so allow debit-specific methods and let
-- the payment recorders use them. Superset of the live constraint (identical on PROD and TEST).
alter table crm_payments drop constraint if exists crm_payments_method_check;
alter table crm_payments add constraint crm_payments_method_check check (
  method = ANY (ARRAY[
    'ACH/E-Check', 'AR Write-off', 'AutoPay', 'Cash', 'Check',
    'Credit Card- AmEx', 'Credit Card- Discover', 'Credit Card- MasterCard',
    'Credit Card- Visa', 'Other', 'Account Credit',
    'Debit Card- Discover', 'Debit Card- MasterCard', 'Debit Card- Visa'
  ])
);
