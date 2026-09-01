import { getBackupSummary, type ClarityBackupPayload } from './backup-restore-service';

describe('backup-restore-service', () => {
  it('extracts correct metadata summary from backup payload', () => {
    const mockPayload: ClarityBackupPayload = {
      version: 1,
      appName: 'Clarity',
      exportedAt: '2026-09-01T12:00:00.000Z',
      data: {
        accounts: [{ id: '1', name: 'Savings' }, { id: '2', name: 'Wallet' }],
        transactions: [
          { id: 't1', amount: 50 },
          { id: 't2', amount: 100 },
          { id: 't3', amount: 20 },
        ],
        goals: [{ id: 'g1', name: 'Emergency Fund' }],
        goal_contributions: [],
        budget_plans: [],
        budget_categories: [],
        recurring_transactions: [],
        notifications: [],
      },
    };

    const summary = getBackupSummary(mockPayload);
    expect(summary.version).toBe(1);
    expect(summary.exportedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(summary.accountCount).toBe(2);
    expect(summary.transactionCount).toBe(3);
    expect(summary.goalCount).toBe(1);
  });
});
