create policy "crm_invoice_items_delete"
  on crm_invoice_line_items
  for delete
  using (org_id = (select org_id from profiles where id = auth.uid()));
