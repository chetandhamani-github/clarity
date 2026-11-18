import { parseCsvRows, parseDate, parseBankStatementCsv } from './csv-parser-service';

describe('csv-parser-service', () => {
  describe('parseCsvRows', () => {
    it('handles simple comma-separated lines', () => {
      const csv = 'Date,Description,Amount\n2026-11-15,Swiggy,450.50';
      const rows = parseCsvRows(csv);
      expect(rows).toEqual([
        ['Date', 'Description', 'Amount'],
        ['2026-11-15', 'Swiggy', '450.50'],
      ]);
    });

    it('handles commas inside quoted strings correctly', () => {
      const csv = 'Date,Description,Amount\n2026-11-15,"Swiggy, Bangalore",450.50';
      const rows = parseCsvRows(csv);
      expect(rows).toEqual([
        ['Date', 'Description', 'Amount'],
        ['2026-11-15', 'Swiggy, Bangalore', '450.50'],
      ]);
    });
  });

  describe('parseDate', () => {
    it('normalizes DD/MM/YYYY', () => {
      expect(parseDate('15/11/2026')).toBe('2026-11-15');
    });

    it('normalizes DD-MM-YYYY', () => {
      expect(parseDate('05-08-2026')).toBe('2026-08-05');
    });

    it('normalizes DD Mon YYYY', () => {
      expect(parseDate('25 Nov 2026')).toBe('2026-11-25');
    });

    it('keeps YYYY-MM-DD intact', () => {
      expect(parseDate('2026-12-01')).toBe('2026-12-01');
    });
  });

  describe('parseBankStatementCsv', () => {
    it('parses standard Indian bank statement with separate Debit and Credit columns', () => {
      const hdfcCsv = `
Date,Narration,Withdrawal,Deposit,Balance
15/11/2026,UPI/123456/SWIGGY/HDFC,450.00,,12000.00
16/11/2026,SALARY CREDIT NOV 2026,,85000.00,97000.00
17/11/2026,ATM WDL CASH,2000.00,,95000.00
      `.trim();

      const result = parseBankStatementCsv(hdfcCsv);
      expect(result.transactions).toHaveLength(3);

      expect(result.transactions[0]).toMatchObject({
        date: '2026-11-15',
        amount: 450,
        type: 'expense',
        merchant: 'SWIGGY',
        category: 'Food & Dining',
      });

      expect(result.transactions[1]).toMatchObject({
        date: '2026-11-16',
        amount: 85000,
        type: 'income',
      });

      expect(result.transactions[2]).toMatchObject({
        date: '2026-11-17',
        amount: 2000,
        type: 'expense',
      });
    });

    it('parses statement with single Amount and Type column', () => {
      const csv = `
Date,Particulars,Amount,Type
2026-11-10,BLINKIT GROCERY,320.00,DR
2026-11-12,REFUND FROM AMAZON,1150.00,CR
      `.trim();

      const result = parseBankStatementCsv(csv);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[0].amount).toBe(320);
      expect(result.transactions[1].type).toBe('income');
      expect(result.transactions[1].amount).toBe(1150);
    });

    it('handles files with intro headers prior to data table', () => {
      const sbiCsv = `
Account Statement for 123456789
Branch: Main Branch
Txn Date,Description,Debit Amount,Credit Amount
01/10/2026,PETROL PUMP HPCL,2500.00,
      `.trim();

      const result = parseBankStatementCsv(sbiCsv);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].date).toBe('2026-10-01');
      expect(result.transactions[0].amount).toBe(2500);
      expect(result.transactions[0].type).toBe('expense');
    });
  });
});
