-- Link a PO directly to a damage case (case-level, not just expense-level)
ALTER TABLE public.damage_cases
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id);
