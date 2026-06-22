-- Set org_id defaults on CRM tables to match the pattern used by all other tables.
-- my_org_id() returns the current authenticated user's org_id.
ALTER TABLE clients           ALTER COLUMN org_id SET DEFAULT my_org_id();
ALTER TABLE client_properties ALTER COLUMN org_id SET DEFAULT my_org_id();
ALTER TABLE client_contacts   ALTER COLUMN org_id SET DEFAULT my_org_id();
ALTER TABLE client_tags       ALTER COLUMN org_id SET DEFAULT my_org_id();
ALTER TABLE client_activity   ALTER COLUMN org_id SET DEFAULT my_org_id();
