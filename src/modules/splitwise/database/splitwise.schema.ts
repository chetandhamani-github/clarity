export const SPLITWISE_TABLES = {
  PEOPLE: 'splitwise_people',
  DEBTS: 'splitwise_debts',
  SETTLEMENTS: 'splitwise_settlements',
  GROUPS: 'splitwise_groups',
  GROUP_MEMBERS: 'splitwise_group_members',
  EXPENSES: 'splitwise_expenses',
  EXPENSE_SPLITS: 'splitwise_expense_splits',
} as const;

export const CREATE_SPLITWISE_PEOPLE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS splitwise_people (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export const CREATE_SPLITWISE_DEBTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS splitwise_debts (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('OWE_ME', 'I_OWE')),
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES splitwise_people(id) ON DELETE CASCADE
  );
`;

export const CREATE_SPLITWISE_SETTLEMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS splitwise_settlements (
    id TEXT PRIMARY KEY NOT NULL,
    person_id TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES splitwise_people(id) ON DELETE CASCADE
  );
`;

// ----------------------------------------------------------------------------
// Future Support Architecture Schema: Groups, Members, Expenses & Splits
// ----------------------------------------------------------------------------

export const CREATE_SPLITWISE_GROUPS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS splitwise_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    category TEXT,
    currency TEXT DEFAULT 'INR',
    created_by TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    sync_status TEXT DEFAULT 'LOCAL_ONLY',
    sync_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );
`;

export const CREATE_SPLITWISE_GROUP_MEMBERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS splitwise_group_members (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member', 'viewer')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'LOCAL_ONLY',
    FOREIGN KEY (group_id) REFERENCES splitwise_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES splitwise_people(id) ON DELETE CASCADE,
    UNIQUE(group_id, person_id)
  );
`;

export const CREATE_SPLITWISE_EXPENSES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS splitwise_expenses (
    id TEXT PRIMARY KEY NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    category TEXT,
    date TEXT NOT NULL DEFAULT (datetime('now')),
    payer_id TEXT NOT NULL,
    group_id TEXT,
    split_type TEXT NOT NULL DEFAULT 'EQUAL' CHECK(split_type IN ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES', 'ADJUSTMENT')),
    notes TEXT,
    receipt_url TEXT,
    created_by_id TEXT,
    sync_status TEXT DEFAULT 'LOCAL_ONLY',
    sync_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (payer_id) REFERENCES splitwise_people(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES splitwise_groups(id) ON DELETE CASCADE
  );
`;

export const CREATE_SPLITWISE_EXPENSE_SPLITS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS splitwise_expense_splits (
    id TEXT PRIMARY KEY NOT NULL,
    expense_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    owed_amount REAL NOT NULL DEFAULT 0,
    percentage REAL,
    shares REAL,
    is_paid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (expense_id) REFERENCES splitwise_expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES splitwise_people(id) ON DELETE CASCADE
  );
`;

export const CREATE_SPLITWISE_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_splitwise_people_name ON splitwise_people(name);
  CREATE INDEX IF NOT EXISTS idx_splitwise_debts_person ON splitwise_debts(person_id);
  CREATE INDEX IF NOT EXISTS idx_splitwise_debts_type ON splitwise_debts(type);
  CREATE INDEX IF NOT EXISTS idx_splitwise_debts_created ON splitwise_debts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_splitwise_settlements_person ON splitwise_settlements(person_id);
  CREATE INDEX IF NOT EXISTS idx_splitwise_settlements_created ON splitwise_settlements(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_splitwise_groups_name ON splitwise_groups(name);
  CREATE INDEX IF NOT EXISTS idx_splitwise_group_members_group ON splitwise_group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_splitwise_group_members_person ON splitwise_group_members(person_id);
  CREATE INDEX IF NOT EXISTS idx_splitwise_expenses_group ON splitwise_expenses(group_id);
  CREATE INDEX IF NOT EXISTS idx_splitwise_expenses_payer ON splitwise_expenses(payer_id);
  CREATE INDEX IF NOT EXISTS idx_splitwise_expenses_date ON splitwise_expenses(date DESC);
  CREATE INDEX IF NOT EXISTS idx_splitwise_expense_splits_expense ON splitwise_expense_splits(expense_id);
  CREATE INDEX IF NOT EXISTS idx_splitwise_expense_splits_person ON splitwise_expense_splits(person_id);
`;

export const CREATE_ALL_SPLITWISE_SCHEMA_SQL = `
  ${CREATE_SPLITWISE_PEOPLE_TABLE_SQL}
  ${CREATE_SPLITWISE_DEBTS_TABLE_SQL}
  ${CREATE_SPLITWISE_SETTLEMENTS_TABLE_SQL}
  ${CREATE_SPLITWISE_GROUPS_TABLE_SQL}
  ${CREATE_SPLITWISE_GROUP_MEMBERS_TABLE_SQL}
  ${CREATE_SPLITWISE_EXPENSES_TABLE_SQL}
  ${CREATE_SPLITWISE_EXPENSE_SPLITS_TABLE_SQL}
  ${CREATE_SPLITWISE_INDEXES_SQL}
`;

export const DROP_ALL_SPLITWISE_TABLES_SQL = `
  DROP TABLE IF EXISTS splitwise_expense_splits;
  DROP TABLE IF EXISTS splitwise_expenses;
  DROP TABLE IF EXISTS splitwise_group_members;
  DROP TABLE IF EXISTS splitwise_groups;
  DROP TABLE IF EXISTS splitwise_settlements;
  DROP TABLE IF EXISTS splitwise_debts;
  DROP TABLE IF EXISTS splitwise_people;
`;
