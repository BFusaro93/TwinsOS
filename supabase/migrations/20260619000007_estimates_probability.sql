-- Add probability % to estimates for pipeline forecasting (Aspire/SA feature)
alter table estimates
  add column if not exists probability_bps integer not null default 0;
