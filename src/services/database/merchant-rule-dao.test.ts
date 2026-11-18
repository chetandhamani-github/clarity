import {
  saveMerchantRule,
  getAllMerchantRules,
  findCategoryForMerchant,
  deleteMerchantRule,
} from './merchant-rule-dao';
import { getDatabase } from './index';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

describe('merchant-rule-dao', () => {
  let mockDb: {
    getAllAsync: jest.Mock;
    getFirstAsync: jest.Mock;
    runAsync: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn(),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  describe('saveMerchantRule', () => {
    it('saves a clean lowercase rule into database', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      const rule = await saveMerchantRule('SWIGGY', 'Food & Dining');
      expect(rule.merchantPattern).toBe('swiggy');
      expect(rule.category).toBe('Food & Dining');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO merchant_category_rules'),
        expect.arrayContaining([expect.any(String), 'swiggy', 'Food & Dining', expect.any(Number)])
      );
    });

    it('throws when merchant pattern or category is empty', async () => {
      await expect(saveMerchantRule('', 'Food & Dining')).rejects.toThrow();
      await expect(saveMerchantRule('Swiggy', '')).rejects.toThrow();
    });
  });

  describe('getAllMerchantRules', () => {
    it('returns all mapped rules in descending order of update time', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          id: 'rule_1',
          merchant_pattern: 'swiggy',
          category: 'Food & Dining',
          updated_at: 1700000000000,
        },
        {
          id: 'rule_2',
          merchant_pattern: 'uber',
          category: 'Transportation',
          updated_at: 1690000000000,
        },
      ]);

      const rules = await getAllMerchantRules();
      expect(rules).toHaveLength(2);
      expect(rules[0].merchantPattern).toBe('swiggy');
      expect(rules[1].merchantPattern).toBe('uber');
    });
  });

  describe('findCategoryForMerchant', () => {
    it('finds category for a merchant pattern match', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ category: 'Food & Dining' });

      const category = await findCategoryForMerchant('Swiggy Order');
      expect(category).toBe('Food & Dining');
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT category FROM merchant_category_rules'),
        ['swiggy order', 'swiggy order']
      );
    });

    it('returns null if merchant is blank or unmatched', async () => {
      expect(await findCategoryForMerchant('')).toBeNull();
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      expect(await findCategoryForMerchant('Unknown Store')).toBeNull();
    });
  });

  describe('deleteMerchantRule', () => {
    it('deletes rule by id', async () => {
      await deleteMerchantRule('rule_123');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM merchant_category_rules WHERE id = ?',
        ['rule_123']
      );
    });
  });
});
