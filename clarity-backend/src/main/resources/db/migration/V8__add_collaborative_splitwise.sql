ALTER TABLE split_people ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE split_people ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);

ALTER TABLE split_debts ADD COLUMN IF NOT EXISTS friend_email VARCHAR(255);
ALTER TABLE split_debts ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);

ALTER TABLE split_settlements ADD COLUMN IF NOT EXISTS friend_email VARCHAR(255);
ALTER TABLE split_settlements ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_split_people_owner ON split_people (owner_email);
CREATE INDEX IF NOT EXISTS idx_split_people_email ON split_people (email);

CREATE INDEX IF NOT EXISTS idx_split_debts_owner ON split_debts (owner_email);
CREATE INDEX IF NOT EXISTS idx_split_debts_friend_email ON split_debts (friend_email);

CREATE INDEX IF NOT EXISTS idx_split_settlements_owner ON split_settlements (owner_email);
CREATE INDEX IF NOT EXISTS idx_split_settlements_friend_email ON split_settlements (friend_email);
