-- uq_assets_org_asset_tag was unique over (org_id, asset_tag) for every live
-- row, so an org could only ever hold ONE asset with a blank tag. The public
-- API (POST /api/v1/assets, MCP create_assets) lets assetTag be omitted and
-- stores '' — the SECOND such asset hit 23505 and the caller got a bare 500.
-- The app's own New Asset form requires a tag, so only API/MCP callers hit it.
--
-- Same asymmetry parts had (fixed in 20260918180000): uniqueness only means
-- something for a real tag. Relaxing to non-blank tags cannot fail on existing
-- data and keeps every real tag unique per org exactly as before.
drop index if exists public.uq_assets_org_asset_tag;

create unique index if not exists uq_assets_org_asset_tag
  on public.assets (org_id, asset_tag)
  where asset_tag <> '' and deleted_at is null;
