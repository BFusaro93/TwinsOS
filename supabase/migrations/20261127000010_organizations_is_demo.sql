-- Demo / sandbox orgs: seeded with fake staff and customers for demos and
-- testing. Background jobs that email people (the Equipt alert digests) skip
-- them, so a demo login or a real person added to the sandbox is never mailed
-- about demo data. Service role / SQL only in practice — nothing in the app
-- writes this column; a tenant flipping it on its own row would only mute its
-- own digests.
alter table public.organizations
  add column if not exists is_demo boolean not null default false;

-- The shared sandbox org ("Landscapt Lawn & Landscape").
update public.organizations
   set is_demo = true
 where id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
