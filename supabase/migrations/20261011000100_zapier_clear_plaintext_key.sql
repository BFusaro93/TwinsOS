-- APPLY ONLY AFTER the new code (hashed Zapier key lookup) is deployed.
-- Old code authenticates against integrations.api_key plaintext; running this
-- earlier would lock every Zapier connection out.
update public.integrations
   set api_key = null
 where provider = 'zapier'
   and api_key is not null
   and api_key_hash is not null;
