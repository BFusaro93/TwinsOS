-- Apply org_id defaults so clients never need to pass org_id explicitly
ALTER TABLE public.damage_cases         ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.damage_case_expenses ALTER COLUMN org_id SET DEFAULT public.my_org_id();
