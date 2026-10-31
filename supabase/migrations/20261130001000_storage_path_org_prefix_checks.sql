-- estimate_photos accepted any storage_path, so a member of one org could point a row at another
-- org's object and have a public proposal link serve it. invoice_photos already carries this
-- constraint. The legacy estimate-photos/{org}/... layout stays valid (it still exists in data and
-- the photo routes accept it). NOT VALID: enforced for every new/updated row without failing on
-- existing history.
alter table public.estimate_photos
  add constraint estimate_photos_storage_path_org_prefix
  check (
    storage_path like org_id::text || '/%'
    or storage_path like 'estimate-photos/' || org_id::text || '/%'
  ) not valid;
