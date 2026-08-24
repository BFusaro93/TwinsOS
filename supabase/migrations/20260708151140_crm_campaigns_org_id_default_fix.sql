-- Fix: crm_campaigns.org_id was missing the default my_org_id() that every
-- other CRM table has, so client-side inserts (which never set org_id
-- explicitly) violated the NOT NULL constraint. This is why saving a new
-- campaign failed with a generic "Failed to save campaign" toast. Same bug
-- previously fixed on crm_roles and crm_packages.
alter table crm_campaigns
  alter column org_id set default my_org_id();
