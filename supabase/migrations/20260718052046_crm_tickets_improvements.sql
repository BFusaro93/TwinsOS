-- Add on_hold status to crm_tickets
ALTER TABLE crm_tickets DROP CONSTRAINT IF EXISTS crm_tickets_status_check;
ALTER TABLE crm_tickets ADD CONSTRAINT crm_tickets_status_check
  CHECK (status IN ('open','closed','pending','on_hold'));

-- Ticket contributors (CC-style — people subscribed to a ticket)
CREATE TABLE ticket_contributors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL DEFAULT my_org_id(),
  ticket_id  uuid NOT NULL REFERENCES crm_tickets(id) ON DELETE CASCADE,
  user_name  text NOT NULL,
  added_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_name)
);

ALTER TABLE ticket_contributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can select ticket contributors"
  ON ticket_contributors FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org members can insert ticket contributors"
  ON ticket_contributors FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org members can delete ticket contributors"
  ON ticket_contributors FOR DELETE
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX ON ticket_contributors (ticket_id);

-- Seed default ticket categories into crm_list_options (only if none exist yet)
-- This lets org owners manage them from Settings > CRM > Ticket Categories
INSERT INTO crm_list_options (org_id, list_name, value, sort_order)
SELECT
  o.id,
  'ticket_categories',
  v.value,
  v.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('Uncategorized',             1),
  ('Estimate',                  2),
  ('Billing',                   3),
  ('Change Service',            4),
  ('Client Portal Message',     5),
  ('Complaint',                 6),
  ('Need to Contact Customer',  7),
  ('Schedule Service',          8),
  ('Terminate Service',         9),
  ('Other',                    10)
) AS v(value, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_list_options
  WHERE org_id = o.id AND list_name = 'ticket_categories'
  LIMIT 1
);
