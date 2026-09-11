import {
  BalanceCalculator,
  roundCurrency,
  calculateTotalReceivable,
  calculateTotalPayable,
  calculateTotalSettled,
  calculateNetBalance,
  calculateRemainingReceivable,
  determineBalanceStatus,
  getStatusLabel,
  calculatePersonBalance,
  calculatePeopleBalances,
  calculateOverallSummary,
} from '../services/BalanceCalculator';
import type { Person, Debt, Settlement } from '../types/splitwise.types';

describe('BalanceCalculator', () => {
  describe('User Prompt Example: OWE_ME ₹5000, Settlement ₹1000 -> Remaining ₹4000', () => {
    it('calculates remaining receivable correctly for OWE_ME ₹5000 with ₹1000 settlement', () => {
      const debts: Debt[] = [
        {
          id: 'd-1',
          personId: 'p-1',
          amount: 5000,
          type: 'OWE_ME',
          description: 'Weekend trip Airbnb share',
          createdAt: '2026-09-01',
        },
      ];

      const settlements: Settlement[] = [
        {
          id: 's-1',
          personId: 'p-1',
          amount: 1000,
          description: 'Partial UPI transfer',
          createdAt: '2026-09-02',
        },
      ];

      const person: Person = {
        id: 'p-1',
        name: 'Rohan',
        createdAt: '2026-09-01',
      };

      const result = calculatePersonBalance('p-1', debts, settlements, person);

      expect(result.totalReceivable).toBe(5000);
      expect(result.totalPayable).toBe(0);
      expect(result.totalSettled).toBe(1000);
      expect(result.netBalance).toBe(4000);
      expect(result.remainingReceivable).toBe(4000);
      expect(result.status).toBe('OWED_TO_ME');
      expect(result.statusLabel).toBe('Owes you');
    });
  });

  describe('Pure calculation functions', () => {
    it('calculates total receivable (OWE_ME debts)', () => {
      const debts: Debt[] = [
        { id: '1', personId: 'p-1', amount: 1500, type: 'OWE_ME', description: 'Lunch', createdAt: '2026-09-01' },
        { id: '2', personId: 'p-1', amount: 3500.5, type: 'OWE_ME', description: 'Groceries', createdAt: '2026-09-02' },
        { id: '3', personId: 'p-1', amount: 500, type: 'I_OWE', description: 'Coffee', createdAt: '2026-09-03' },
      ];

      expect(calculateTotalReceivable(debts)).toBe(5000.5);
    });

    it('calculates total payable (I_OWE debts)', () => {
      const debts: Debt[] = [
        { id: '1', personId: 'p-1', amount: 1500, type: 'OWE_ME', description: 'Lunch', createdAt: '2026-09-01' },
        { id: '2', personId: 'p-1', amount: 800, type: 'I_OWE', description: 'Movie ticket', createdAt: '2026-09-02' },
        { id: '3', personId: 'p-1', amount: 450.25, type: 'I_OWE', description: 'Cab', createdAt: '2026-09-03' },
      ];

      expect(calculateTotalPayable(debts)).toBe(1250.25);
    });

    it('calculates total settled amount', () => {
      const settlements: Settlement[] = [
        { id: '1', personId: 'p-1', amount: 1000, createdAt: '2026-09-01' },
        { id: '2', personId: 'p-1', amount: 500.75, createdAt: '2026-09-02' },
      ];

      expect(calculateTotalSettled(settlements)).toBe(1500.75);
    });

    it('calculates net balance accurately', () => {
      // (Receivable 3000 - Payable 1000) - Settled 500 = 1500
      expect(calculateNetBalance(3000, 1000, 500)).toBe(1500);

      // (Receivable 1000 - Payable 2500) - Settled 0 = -1500
      expect(calculateNetBalance(1000, 2500, 0)).toBe(-1500);

      // (Receivable 2000 - Payable 0) - Settled 2000 = 0
      expect(calculateNetBalance(2000, 0, 2000)).toBe(0);
    });

    it('calculates remaining receivable without negative values', () => {
      expect(calculateRemainingReceivable(5000, 1000)).toBe(4000);
      expect(calculateRemainingReceivable(5000, 5000)).toBe(0);
      expect(calculateRemainingReceivable(5000, 6000)).toBe(0);
    });

    it('determines balance status correctly', () => {
      expect(determineBalanceStatus(450)).toBe('OWED_TO_ME');
      expect(determineBalanceStatus(-250)).toBe('YOU_OWE');
      expect(determineBalanceStatus(0)).toBe('SETTLED');
      expect(determineBalanceStatus(0.0001)).toBe('SETTLED');
    });

    it('generates accurate status labels', () => {
      expect(getStatusLabel('OWED_TO_ME', 500)).toBe('Owes you');
      expect(getStatusLabel('YOU_OWE', -500)).toBe('You owe');
      expect(getStatusLabel('SETTLED', 0)).toBe('Settled up');
    });

    it('handles floating point currency precision safely', () => {
      expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
      expect(roundCurrency(19.999)).toBe(20);
      expect(roundCurrency(NaN)).toBe(0);
    });
  });

  describe('Complex multi-person and overall portfolio summary', () => {
    const people: Person[] = [
      { id: 'p-1', name: 'Aarav', createdAt: '2026-09-01' },
      { id: 'p-2', name: 'Diya', createdAt: '2026-09-01' },
      { id: 'p-3', name: 'Kabir', createdAt: '2026-09-01' },
    ];

    const debts: Debt[] = [
      // Aarav: owes me 3000
      { id: 'd-1', personId: 'p-1', amount: 3000, type: 'OWE_ME', description: 'Concert ticket', createdAt: '2026-09-01' },
      // Diya: I owe her 1200
      { id: 'd-2', personId: 'p-2', amount: 1200, type: 'I_OWE', description: 'Dinner bill', createdAt: '2026-09-01' },
      // Kabir: owes me 2000, but I owe him 500
      { id: 'd-3', personId: 'p-3', amount: 2000, type: 'OWE_ME', description: 'Flight ticket', createdAt: '2026-09-01' },
      { id: 'd-4', personId: 'p-3', amount: 500, type: 'I_OWE', description: 'Airport cab', createdAt: '2026-09-01' },
    ];

    const settlements: Settlement[] = [
      // Aarav paid 1000
      { id: 's-1', personId: 'p-1', amount: 1000, description: 'UPI', createdAt: '2026-09-02' },
      // Kabir settled 1500 (full remaining)
      { id: 's-2', personId: 'p-3', amount: 1500, description: 'Bank transfer', createdAt: '2026-09-02' },
    ];

    it('computes detailed balances for each person', () => {
      const balances = calculatePeopleBalances(people, debts, settlements);

      expect(balances).toHaveLength(3);

      // 1. Aarav: OWE_ME 3000, Settled 1000 -> Net +2000 (Owed to me)
      const aarav = balances.find((b) => b.personId === 'p-1')!;
      expect(aarav.totalReceivable).toBe(3000);
      expect(aarav.totalPayable).toBe(0);
      expect(aarav.totalSettled).toBe(1000);
      expect(aarav.netBalance).toBe(2000);
      expect(aarav.status).toBe('OWED_TO_ME');

      // 2. Diya: I_OWE 1200, Settled 0 -> Net -1200 (You owe)
      const diya = balances.find((b) => b.personId === 'p-2')!;
      expect(diya.totalReceivable).toBe(0);
      expect(diya.totalPayable).toBe(1200);
      expect(diya.totalSettled).toBe(0);
      expect(diya.netBalance).toBe(-1200);
      expect(diya.status).toBe('YOU_OWE');

      // 3. Kabir: OWE_ME 2000, I_OWE 500 (Gross +1500), Settled 1500 -> Net 0 (Settled)
      const kabir = balances.find((b) => b.personId === 'p-3')!;
      expect(kabir.totalReceivable).toBe(2000);
      expect(kabir.totalPayable).toBe(500);
      expect(kabir.totalSettled).toBe(1500);
      expect(kabir.netBalance).toBe(0);
      expect(kabir.status).toBe('SETTLED');
    });

    it('computes overall portfolio summary across all people', () => {
      const summary = calculateOverallSummary(people, debts, settlements);

      expect(summary.totalPeopleCount).toBe(3);
      expect(summary.totalReceivable).toBe(5000); // 3000 + 0 + 2000
      expect(summary.totalPayable).toBe(1700); // 0 + 1200 + 500
      expect(summary.totalSettled).toBe(2500); // 1000 + 0 + 1500
      expect(summary.netBalance).toBe(800); // 2000 - 1200 + 0 = 800
      expect(summary.activePeopleCount).toBe(2); // Aarav & Diya
      expect(summary.settledPeopleCount).toBe(1); // Kabir
    });
  });

  describe('Edge cases and empty datasets', () => {
    it('handles empty debts and settlements gracefully', () => {
      const result = calculatePersonBalance('p-empty', [], []);

      expect(result.totalReceivable).toBe(0);
      expect(result.totalPayable).toBe(0);
      expect(result.totalSettled).toBe(0);
      expect(result.netBalance).toBe(0);
      expect(result.remainingReceivable).toBe(0);
      expect(result.status).toBe('SETTLED');
    });

    it('handles empty people list in overall summary', () => {
      const summary = calculateOverallSummary([], [], []);

      expect(summary.totalPeopleCount).toBe(0);
      expect(summary.activePeopleCount).toBe(0);
      expect(summary.settledPeopleCount).toBe(0);
      expect(summary.netBalance).toBe(0);
    });
  });

  describe('Split Calculation Engines (Future Support Architecture)', () => {
    it('calculates equal splits and handles penny remainders cleanly', () => {
      // ₹100 split among 3 people
      const result = BalanceCalculator.calculateEqualSplits({
        totalAmount: 100,
        payerId: 'p-1',
        participantIds: ['p-1', 'p-2', 'p-3'],
      });

      expect(result.isValid).toBe(true);
      expect(result.shares).toHaveLength(3);

      const sumOwed = result.shares.reduce((acc, s) => acc + s.owedAmount, 0);
      expect(roundCurrency(sumOwed)).toBe(100);

      // First person (remainder receiver) pays 33.34, others pay 33.33
      expect(result.shares[0].owedAmount).toBe(33.34);
      expect(result.shares[1].owedAmount).toBe(33.33);
      expect(result.shares[2].owedAmount).toBe(33.33);

      // Payer (p-1) paid 100, owes 33.34 -> net owed is -66.66 (is owed 66.66)
      expect(result.shares[0].paidAmount).toBe(100);
      expect(result.shares[0].netOwed).toBe(-66.66);

      // Other participants paid 0, owe 33.33 -> net owed is +33.33
      expect(result.shares[1].paidAmount).toBe(0);
      expect(result.shares[1].netOwed).toBe(33.33);
    });

    it('calculates percentage splits and validates 100% total', () => {
      // Valid percentage split: 50% / 30% / 20% on ₹1,000
      const valid = BalanceCalculator.calculatePercentageSplits({
        totalAmount: 1000,
        payerId: 'p-1',
        splits: [
          { personId: 'p-1', percentage: 50 },
          { personId: 'p-2', percentage: 30 },
          { personId: 'p-3', percentage: 20 },
        ],
      });

      expect(valid.isValid).toBe(true);
      expect(valid.shares[0].owedAmount).toBe(500);
      expect(valid.shares[1].owedAmount).toBe(300);
      expect(valid.shares[2].owedAmount).toBe(200);

      // Invalid percentage split: 40% + 30% = 70%
      const invalid = BalanceCalculator.calculatePercentageSplits({
        totalAmount: 1000,
        payerId: 'p-1',
        splits: [
          { personId: 'p-1', percentage: 40 },
          { personId: 'p-2', percentage: 30 },
        ],
      });

      expect(invalid.isValid).toBe(false);
      expect(invalid.errorMessage).toContain('100%');
    });

    it('calculates exact splits and validates exact sum match', () => {
      const valid = BalanceCalculator.calculateExactSplits({
        totalAmount: 450,
        payerId: 'p-1',
        splits: [
          { personId: 'p-1', amount: 150 },
          { personId: 'p-2', amount: 300 },
        ],
      });

      expect(valid.isValid).toBe(true);
      expect(valid.shares[0].owedAmount).toBe(150);
      expect(valid.shares[1].owedAmount).toBe(300);

      const invalid = BalanceCalculator.calculateExactSplits({
        totalAmount: 500,
        payerId: 'p-1',
        splits: [
          { personId: 'p-1', amount: 200 },
          { personId: 'p-2', amount: 200 },
        ],
      });

      expect(invalid.isValid).toBe(false);
    });

    it('calculates shares/ratio splits correctly', () => {
      // 2 shares vs 1 share on ₹300
      const result = BalanceCalculator.calculateSharesSplits({
        totalAmount: 300,
        payerId: 'p-1',
        splits: [
          { personId: 'p-1', shares: 2 },
          { personId: 'p-2', shares: 1 },
        ],
      });

      expect(result.isValid).toBe(true);
      expect(result.shares[0].owedAmount).toBe(200);
      expect(result.shares[1].owedAmount).toBe(100);
    });
  });
});

