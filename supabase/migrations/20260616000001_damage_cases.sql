-- Damage Cases: track property damage incidents and warranty claims
CREATE TABLE damage_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  deleted_at    timestamptz,

  case_number   text NOT NULL,  -- auto-generated, e.g. DC-2026-001
  case_type     text NOT NULL DEFAULT 'damage' CHECK (case_type IN ('damage', 'warranty')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),

  customer_name     text NOT NULL,
  property_address  text,
  date_of_incident  date NOT NULL,
  description       text NOT NULL,  -- what was damaged / warranty issue
  resolution_notes  text,

  CONSTRAINT damage_cases_case_number_org_unique UNIQUE (org_id, case_number)
);

-- Expenses tied to a damage case (repair invoices, replacement parts, etc.)
CREATE TABLE damage_case_expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  deleted_at      timestamptz,

  damage_case_id  uuid NOT NULL REFERENCES damage_cases(id),
  expense_date    date NOT NULL,
  vendor_id       uuid REFERENCES vendors(id),
  vendor_name     text,  -- free-text fallback when no vendor FK
  description     text NOT NULL,
  amount          integer NOT NULL DEFAULT 0,  -- cents
  purchase_order_id uuid REFERENCES purchase_orders(id)
);

-- Sequence for case numbers per org (stored in a small helper table)
-- We use a simple per-org counter approach via a DB function
CREATE OR REPLACE FUNCTION next_damage_case_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year   text := to_char(now(), 'YYYY');
  v_org_id uuid;
  v_count  int;
BEGIN
  SELECT org_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  SELECT COUNT(*) + 1
    INTO v_count
    FROM damage_cases
   WHERE org_id = v_org_id
     AND to_char(created_at, 'YYYY') = v_year
     AND deleted_at IS NULL;
  RETURN 'DC-' || v_year || '-' || lpad(v_count::text, 3, '0');
END;
$$;

-- RLS
ALTER TABLE damage_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_case_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage damage_cases"
  ON damage_cases FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org members can manage damage_case_expenses"
  ON damage_case_expenses FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- updated_at triggers
CREATE TRIGGER set_damage_cases_updated_at
  BEFORE UPDATE ON damage_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_damage_case_expenses_updated_at
  BEFORE UPDATE ON damage_case_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
