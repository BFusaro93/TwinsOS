alter table clients
  add column if not exists phones jsonb not null default '[]'::jsonb;
