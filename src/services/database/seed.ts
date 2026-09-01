import type * as SQLite from 'expo-sqlite';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function seedDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  // 1. Seed default accounts if none exist (Starts cleanly at ₹0.00)
  const accountResult = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM accounts;'
  );
  if (!accountResult || accountResult.count === 0) {
    const defaultAccountId = uuid();
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, balance, institution, last_four, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'));`,
      [defaultAccountId, 'Primary Bank Account', 'savings', 0, 'Bank / UPI', '']
    );

    const borrowedAccountId = uuid();
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, balance, institution, last_four, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'));`,
      [borrowedAccountId, 'Borrowed / Loan', 'borrowed', 0, 'Personal / Friend', '']
    );
  }

  // 2. Seed standard structured categories for India & modern daily spending
  const categoryResult = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM budget_categories;'
  );
  if (!categoryResult || categoryResult.count === 0) {
    const defaultCategories = [
      // Needs (50%)
      { name: 'Groceries', icon: 'shopping-cart', limit: 8000, bucketType: 'needs', sortOrder: 1 },
      { name: 'Rent & Housing', icon: 'home', limit: 12000, bucketType: 'needs', sortOrder: 2 },
      { name: 'Electricity & Bills', icon: 'flash-on', limit: 2500, bucketType: 'needs', sortOrder: 3 },
      { name: 'Fuel & Transport', icon: 'directions-car', limit: 2500, bucketType: 'needs', sortOrder: 4 },
      { name: 'Health & Medical', icon: 'favorite', limit: 2000, bucketType: 'needs', sortOrder: 5 },
      { name: 'Loan & Debt Repayment', icon: 'handshake', limit: 0, bucketType: 'needs', sortOrder: 6 },

      // Wants (30%)
      { name: 'Dining & Food Delivery', icon: 'restaurant', limit: 4000, bucketType: 'wants', sortOrder: 7 },
      { name: 'Shopping', icon: 'local-mall', limit: 3000, bucketType: 'wants', sortOrder: 8 },
      { name: 'Entertainment & Movies', icon: 'movie', limit: 1500, bucketType: 'wants', sortOrder: 9 },
      { name: 'OTT & Subscriptions', icon: 'subscriptions', limit: 1000, bucketType: 'wants', sortOrder: 10 },
      { name: 'Travel & Outings', icon: 'flight', limit: 2500, bucketType: 'wants', sortOrder: 11 },

      // Savings / Investments (20%)
      { name: 'Mutual Funds & SIP', icon: 'trending-up', limit: 5000, bucketType: 'savings', sortOrder: 12 },
      { name: 'Emergency Fund', icon: 'savings', limit: 3000, bucketType: 'savings', sortOrder: 13 },
      { name: 'Salary / Income', icon: 'work', limit: 0, bucketType: 'savings', sortOrder: 14 },
    ];

    for (const cat of defaultCategories) {
      await db.runAsync(
        `INSERT INTO budget_categories (id, name, icon, budget_limit, bucket_type, sort_order)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [uuid(), cat.name, cat.icon, cat.limit, cat.bucketType, cat.sortOrder]
      );
    }
  }

  // 3. Seed initial 50/30/20 budget plan blueprint for current month
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const planResult = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM budget_plans WHERE month = ? AND year = ?;',
    [currentMonth, currentYear]
  );
  if (!planResult || planResult.count === 0) {
    await db.runAsync(
      `INSERT INTO budget_plans (id, monthly_income, needs_percent, wants_percent, savings_percent, month, year)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [uuid(), 50000, 50, 30, 20, currentMonth, currentYear]
    );
  }

  // 4. Seed friendly welcome notification
  const notifResult = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM notifications;'
  );
  if (!notifResult || notifResult.count === 0) {
    await db.runAsync(
      `INSERT INTO notifications (id, title, description, type, is_read, created_at, action_url)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?);`,
      [
        uuid(),
        'Welcome to Clarity',
        'Your personal finance ledger is set up. Log your daily UPI spends, track accounts, and manage your budget.',
        'milestone',
        0,
        '/add-transaction',
      ]
    );
  }

  // Note: No fake transactions seeded — keeps user ledger 100% clean and authentic.
}
