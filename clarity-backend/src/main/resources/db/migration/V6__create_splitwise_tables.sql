CREATE TABLE IF NOT EXISTS split_people (
    id VARCHAR(255) PRIMARY KEY,
    installation_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    notes TEXT,
    avatar_url VARCHAR(500),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_split_people_inst_updated ON split_people (installation_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS split_debts (
    id VARCHAR(255) PRIMARY KEY,
    installation_id VARCHAR(255) NOT NULL,
    person_id VARCHAR(255) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description VARCHAR(500) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_split_debts_person FOREIGN KEY (person_id) REFERENCES split_people (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_split_debts_inst_updated ON split_debts (installation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_debts_person ON split_debts (person_id);

CREATE TABLE IF NOT EXISTS split_settlements (
    id VARCHAR(255) PRIMARY KEY,
    installation_id VARCHAR(255) NOT NULL,
    person_id VARCHAR(255) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    settlement_type VARCHAR(50) NOT NULL DEFAULT 'THEY_PAID',
    description VARCHAR(500),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_split_settlements_person FOREIGN KEY (person_id) REFERENCES split_people (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_split_settlements_inst_updated ON split_settlements (installation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_settlements_person ON split_settlements (person_id);
