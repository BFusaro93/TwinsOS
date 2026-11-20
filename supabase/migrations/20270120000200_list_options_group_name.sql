-- Optional category for a list option. First user: client tags, which are
-- grouped under category headings in the Add Tag pickers and Settings (e.g.
-- Marketing, CompleteCare Packages, Automations). Null = no category.
-- RLS is unchanged: the existing per-list settings-permission policies cover
-- the new column.

alter table public.crm_list_options
  add column if not exists group_name text;
