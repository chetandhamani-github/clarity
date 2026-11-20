import { calculateSpendingStreaks } from './streak-service';
import { getDatabase } from '@/services/database';

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(),
}));

describe('streak-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns default zero values when database query fails', async () => {
    (getDatabase as jest.Mock).mockReturnValue({
      getAllAsync: jest.fn().mockRejectedValue(new Error('DB failure')),
    });

    const result = await calculateSpendingStreaks(2000);
    expect(result.currentStreak).toBe(0);
    expect(result.yesterdaySpend).toBe(0);
    expect(result.todaySpend).toBe(0);
  });

  it('returns default zero values when no transactions exist', async () => {
    (getDatabase as jest.Mock).mockReturnValue({
      getAllAsync: jest.fn().mockResolvedValue([]),
    });

    const result = await calculateSpendingStreaks(2000);
    expect(result.currentStreak).toBe(0);
    expect(result.yesterdaySpend).toBe(0);
  });

  it('calculates consecutive streak under budget limit', async () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const d1 = new Date(now);
    d1.setDate(d1.getDate() - 1); // yesterday
    const d2 = new Date(now);
    d2.setDate(d2.getDate() - 2); // 2 days ago
    const d3 = new Date(now);
    d3.setDate(d3.getDate() - 3); // 3 days ago

    (getDatabase as jest.Mock).mockReturnValue({
      getAllAsync: jest.fn().mockResolvedValue([
        { day: fmt(now), total: 500 },
        { day: fmt(d1), total: 800 },
        { day: fmt(d2), total: 1200 },
        { day: fmt(d3), total: 3500 }, // Over budget -> breaks streak
      ]),
    });

    const result = await calculateSpendingStreaks(2000);
    // Yesterday (800 <= 2000) and 2 days ago (1200 <= 2000) -> 2 days streak
    expect(result.currentStreak).toBe(2);
    expect(result.yesterdaySpend).toBe(800);
    expect(result.todaySpend).toBe(500);
  });
});

