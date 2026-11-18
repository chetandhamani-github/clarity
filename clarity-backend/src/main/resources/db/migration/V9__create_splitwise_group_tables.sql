CREATE TABLE IF NOT EXISTS split_groups (
    id VARCHAR(255) PRIMARY KEY,
    installation_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    category VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'INR',
    owner_email VARCHAR(255),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_split_groups_inst_updated ON split_groups (installation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_groups_owner ON split_groups (owner_email);

CREATE TABLE IF NOT EXISTS split_group_members (
    id VARCHAR(255) PRIMARY KEY,
    group_id VARCHAR(255) NOT NULL,
    person_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_split_group_members_group FOREIGN KEY (group_id) REFERENCES split_groups (id) ON DELETE CASCADE,
    CONSTRAINT fk_split_group_members_person FOREIGN KEY (person_id) REFERENCES split_people (id) ON DELETE CASCADE,
    CONSTRAINT uq_split_group_members UNIQUE (group_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_split_group_members_group ON split_group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_split_group_members_person ON split_group_members (person_id);

CREATE TABLE IF NOT EXISTS split_expenses (
    id VARCHAR(255) PRIMARY KEY,
    installation_id VARCHAR(255) NOT NULL,
    group_id VARCHAR(255),
    payer_id VARCHAR(255) NOT NULL,
    description VARCHAR(500) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    category VARCHAR(100),
    date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    split_type VARCHAR(50) NOT NULL DEFAULT 'EQUAL',
    notes TEXT,
    receipt_url VARCHAR(500),
    owner_email VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_split_expenses_group FOREIGN KEY (group_id) REFERENCES split_groups (id) ON DELETE CASCADE,
    CONSTRAINT fk_split_expenses_payer FOREIGN KEY (payer_id) REFERENCES split_people (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_split_expenses_inst_updated ON split_expenses (installation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_expenses_group ON split_expenses (group_id);
CREATE INDEX IF NOT EXISTS idx_split_expenses_owner ON split_expenses (owner_email);

CREATE TABLE IF NOT EXISTS split_expense_splits (
    id VARCHAR(255) PRIMARY KEY,
    expense_id VARCHAR(255) NOT NULL,
    person_id VARCHAR(255) NOT NULL,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    owed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    percentage NUMERIC(6, 2),
    shares NUMERIC(6, 2),
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_split_expense_splits_expense FOREIGN KEY (expense_id) REFERENCES split_expenses (id) ON DELETE CASCADE,
    CONSTRAINT fk_split_expense_splits_person FOREIGN KEY (person_id) REFERENCES split_people (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_split_expense_splits_expense ON split_expense_splits (expense_id);
CREATE INDEX IF NOT EXISTS idx_split_expense_splits_person ON split_expense_splits (person_id);

