-- Service Bundles (estimate templates) can carry sub-items per bundle item.
-- On apply to an estimate they are copied into estimate_line_item_subitems.
-- Mirrors estimate_line_item_subitems (incl. print_on_estimate added in
-- 20261129000000). Soft-delete via deleted_at.

create table if not exists public.estimate_template_item_subitems (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null default public.my_org_id() references public.organizations(id) on delete cascade,
  template_item_id  uuid        not null references public.estimate_template_items(id) on delete cascade,
  type              text        not null default 'product' check (type in ('product','subservice')),
  product_id        uuid,
  service_id        uuid,
  name              text        not null,
  qty               numeric     not null default 1,
  rate_cents        integer     not null default 0,
  cost_cents        integer     not null default 0,
  invoice           boolean     not null default true,
  print_on_invoice  boolean     not null default true,
  print_on_estimate boolean     not null default true,
  sort_order        integer     not null default 0,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        default auth.uid()
);

create index if not exists estimate_template_item_subitems_template_item_id_idx
  on public.estimate_template_item_subitems (template_item_id);

alter table public.estimate_template_item_subitems enable row level security;

drop policy if exists "org members manage template item subitems" on public.estimate_template_item_subitems;
create policy "org members manage template item subitems"
  on public.estimate_template_item_subitems
  for all
  using (org_id = (select org_id from public.profiles where id = auth.uid()))
  with check (org_id = (select org_id from public.profiles where id = auth.uid()));

-- Same RESTRICTIVE CRM gate as the sibling estimate_template_items table
-- (20260906210000_wide_crm_rls_tightening_restrictive_policies.sql).
drop policy if exists "require_crm_access" on public.estimate_template_item_subitems;
create policy "require_crm_access"
  on public.estimate_template_item_subitems
  as restrictive
  for all
  using (public.has_crm_access())
  with check (public.has_crm_access());
