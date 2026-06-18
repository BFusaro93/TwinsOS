-- Add budget_hours to projects for actual vs budget comparison
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_hours numeric(6,2);
