ALTER TABLE split_group_members ADD COLUMN IF NOT EXISTS member_email VARCHAR(255);
ALTER TABLE split_group_members ADD COLUMN IF NOT EXISTS member_name VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_split_group_members_email ON split_group_members (member_email);

ALTER TABLE split_expenses ADD COLUMN IF NOT EXISTS payer_email VARCHAR(255);
ALTER TABLE split_expenses ADD COLUMN IF NOT EXISTS payer_name VARCHAR(255);

ALTER TABLE split_expense_splits ADD COLUMN IF NOT EXISTS person_email VARCHAR(255);
ALTER TABLE split_expense_splits ADD COLUMN IF NOT EXISTS person_name VARCHAR(255);

ALTER TABLE split_settlements ADD COLUMN IF NOT EXISTS group_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_split_settlements_group ON split_settlements (group_id);

