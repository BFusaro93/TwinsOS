-- Products get a Files tab (spec sheets, SDS, photos), stored in the shared attachments table.
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_record_type_check;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_record_type_check
  CHECK (record_type IN ('requisition','po','receiving','project','work_order','request','vehicle',
                         'asset','vendor','ticket','damage_case','contract','estimate','job',
                         'injury_case','product'));
