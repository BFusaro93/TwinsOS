-- Generic rate-limit counter for unauthenticated auth endpoints (login,
-- password reset) that have no pre-existing row (like an integration or
-- user) to key off of. Callers pick their own `key` string, e.g.
-- "login:ip:1.2.3.4" or "reset:email:foo@bar.com", so one table can back
-- multiple independently-tuned limits. Mirrors zapier_rate_limit_counters.
create table public.auth_rate_limit_counters (
  key            text        not null,
  window_start   timestamptz not null,
  count          int         not null default 0,
  primary key (key, window_start)
);

alter table public.auth_rate_limit_counters enable row level security;
-- No policies: deny-by-default. Only touched via the SECURITY DEFINER
-- function below, called from server routes with the service-role client.

create index idx_auth_rate_limit_window on public.auth_rate_limit_counters (window_start);

create or replace function public.auth_rate_limit_hit(p_key text, p_window_start timestamptz, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.auth_rate_limit_counters (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start) do update set count = auth_rate_limit_counters.count + 1
  returning count into v_count;

  -- Opportunistic cleanup instead of a cron job, same as zapier_rate_limit_hit.
  if random() < 0.01 then
    delete from public.auth_rate_limit_counters where window_start < now() - interval '1 hour';
  end if;

  return v_count <= p_limit;
end;
$$;
