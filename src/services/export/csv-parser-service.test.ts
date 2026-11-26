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
      expect(result.closingBalance).toBe(95000);
      expect(result.statementDate).toBe('2026-11-17');

      expect(result.transactions[0]).toMatchObject({
        date: '2026-11-15',
        amount: 450,
        type: 'expense',
        merchant: 'SWIGGY',
        category: 'Food & Dining',
        balance: 12000,
      });

      expect(result.transactions[1]).toMatchObject({
        date: '2026-11-16',
        amount: 85000,
        type: 'income',
        balance: 97000,
      });

      expect(result.transactions[2]).toMatchObject({
        date: '2026-11-17',
        amount: 2000,
        type: 'expense',
        balance: 95000,
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

    it('handles OnlineSBI CSVs with 18+ metadata intro lines containing Date/Description keywords', () => {
      const sbiFullCsv = `\uFEFFAccount Name :,John Doe
Address :,MG Road
Date :,26 Nov 2026
Account Number :,00000012345678901
Account Description :,REGULAR SAVINGS BANK ACCOUNT
Branch :,MAIN BRANCH
Drawing Power :,0.00
Interest Rate(% p.a.) :,2.70
MOD Balance :,0.00
CIF No. :,1234567890
IFS Code :,SBIN0000123
MICR Code :,110002001
Nomination Registered :,Yes
Balance as on :,45455.50
Search for :,All
Start Date :,01 Apr 2026
End Date :,26 Nov 2026
Ledger Balance :,45455.50

Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
1 Apr 2026,1 Apr 2026,"UPI/DR/123456/SWIGGY
ORDER",UPI123,450.00,,45005.50
02-Apr-26,02-Apr-26,BY TRANSFER-NEFT SALARY,NEFT99,,25000.00,70005.50
`;
      const result = parseBankStatementCsv(sbiFullCsv);
      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-04-01',
        amount: 450,
        type: 'expense',
        balance: 45005.5,
      });
      expect(result.transactions[1]).toMatchObject({
        date: '2026-04-02',
        amount: 25000,
        type: 'income',
        balance: 70005.5,
      });
    });

    it('handles tab-separated (TSV), semicolon-delimited, Amount(INR) + Dr/Cr columns, and HTML table exports', () => {
      const tsvCsv = [
        'Transaction Date\tTransaction Details\tAmount (INR)\tDr/Cr\tBalance (INR)',
        '15/11/2026 10:30:00\tUPI/412345/ZOMATO\t320.00\tDR\t9,680.00',
        '16/11/2026 11:00:00\tNEFT SALARY\t50,000.00\tCR\t59,680.00',
      ].join('\n');

      const tsvRes = parseBankStatementCsv(tsvCsv);
      expect(tsvRes.transactions).toHaveLength(2);
      expect(tsvRes.transactions[0]).toMatchObject({ date: '2026-11-15', amount: 320, type: 'expense' });
      expect(tsvRes.transactions[1]).toMatchObject({ date: '2026-11-16', amount: 50000, type: 'income' });

      const htmlExport = `<html><body><table>
        <tr><td>Date</td><td></td></tr>
        <tr><th>Txn Date</th><th>Narration</th><th>Withdrawal</th><th>Deposit</th><th>Balance</th></tr>
        <tr><td>05-11-2026</td><td>BLINKIT &amp; CO</td><td>250.00</td><td>&nbsp;</td><td>1,750.00</td></tr>
      </table></body></html>`;

      const htmlRes = parseBankStatementCsv(htmlExport);
      expect(htmlRes.transactions).toHaveLength(1);
      expect(htmlRes.transactions[0]).toMatchObject({
        date: '2026-11-05',
        amount: 250,
        type: 'expense',
        balance: 1750,
      });
    });
  });
});
