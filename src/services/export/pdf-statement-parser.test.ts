import {
  checkIsPdfEncrypted,
  parseBankStatementPdfText,
  parseBankStatementPdf,
  SUPPORTED_BANK_PROFILES,
} from './pdf-statement-parser';
import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';

declare const Buffer: any;

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
    UTF8: 'utf8',
  },
}));

describe('pdf-statement-parser', () => {
  describe('checkIsPdfEncrypted', () => {
    it('detects /Encrypt in PDF headers', () => {
      expect(checkIsPdfEncrypted('%PDF-1.5\n/Encrypt 39 0 R')).toBe(true);
      expect(checkIsPdfEncrypted('/Filter /Standard /V 2 /R 3')).toBe(true);
    });

    it('returns false for unencrypted PDFs and empty strings', () => {
      expect(checkIsPdfEncrypted('')).toBe(false);
      expect(checkIsPdfEncrypted('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj')).toBe(false);
    });
  });

  describe('parseBankStatementPdfText', () => {
    it('parses single-line transactions with running balances', () => {
      const statementText = `
        State Bank of India Statement
        Statement Date: 31/07/2024
        Closing Balance: Rs. 1,24,552.00

        01/07/2024 UPI/Zomato/12345/Food 450.00 1,24,102.00
        05/07/2024 SALARY CREDIT NEFT 50,000.00 1,74,102.00
        10/07/2024 Blinkit Groceries 820.50 1,73,281.50
      `;

      const result = parseBankStatementPdfText(statementText);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(3);

      expect(result.transactions[0].date).toBe('2024-07-01');
      expect(result.transactions[0].amount).toBe(450);
      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[0].category).toBe('Dining');
      expect(result.transactions[0].balance).toBe(124102);

      expect(result.transactions[1].date).toBe('2024-07-05');
      expect(result.transactions[1].amount).toBe(50000);
      expect(result.transactions[1].type).toBe('income');
      expect(result.transactions[1].category).toBe('Salary');

      expect(result.closingBalance).toBe(124552);
      expect(result.statementDate).toBe('2024-07-31');
    });

    it('parses sequential columnar table format (SBI/ICICI style)', () => {
      const columnarText = `
        Post Date
        Value Date
        Details
        Debit
        Credit
        Balance
        30/06/2024
        30/06/2024
        SAVINGS INTEREST CREDIT
        -
        1,008.00
        1,24,552.00CR
        02/07/2024
        02/07/2024
        UPI/Swiggy/Order123
        350.00
        -
        1,24,202.00DR
      `;

      const result = parseBankStatementPdfText(columnarText);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);

      expect(result.transactions[0].date).toBe('2024-06-30');
      expect(result.transactions[0].amount).toBe(1008);
      expect(result.transactions[0].type).toBe('income');

      expect(result.transactions[1].date).toBe('2024-07-02');
      expect(result.transactions[1].amount).toBe(350);
      expect(result.transactions[1].type).toBe('expense');
      expect(result.transactions[1].category).toBe('Dining');
    });

    it('returns empty transactions when text contains no transaction data', () => {
      const text = 'Terms and Conditions\nThis document is a computer generated slip.';
      const result = parseBankStatementPdfText(text);
      expect(result.success).toBe(false);
      expect(result.transactions).toHaveLength(0);
    });
  });

  describe('parseBankStatementPdf', () => {
    it('returns isEncrypted: true when password is missing for an encrypted PDF', async () => {
      const mockRawPdf = '%PDF-1.5\n/Encrypt << /Filter /Standard /V 2 /R 3 >>';
      const base64 = Buffer.from(mockRawPdf, 'latin1').toString('base64');
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(base64);

      const result = await parseBankStatementPdf('file:///test.pdf');
      expect(result.isEncrypted).toBe(true);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Password required');
    });

    it('rejects with incorrect password error when invalid password is provided', async () => {
      const mockPdf = `
%PDF-1.5
/Encrypt 1 0 R
/ID [<9547E63093BB6E15DD0C774EE9396538> <9547E63093BB6E15DD0C774EE9396538>]
1 0 obj
<<
/Filter /Standard
/V 2
/R 3
/Length 128
/P -12
/O <A8E2C41E5EB755B8090429A41CABBA3FB276681D4869B19249296FE0F1F72A8B>
/U <54DEADD359AA22CEA20C08B86E547BF428BF4E5E4E758A4164004E56FFFA0108>
>>
endobj
      `;
      const base64 = Buffer.from(mockPdf, 'latin1').toString('base64');
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(base64);

      const result = await parseBankStatementPdf('file:///test.pdf', { password: 'wrongpassword' });
      expect(result.isEncrypted).toBe(true);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Incorrect password');
    });

    it('handles nested Crypt Filter dictionaries (/CF << /StdCF << /CFM /AESV2 >> >>)', async () => {
      const mockPdf = `
%PDF-1.6
trailer
<<
  /Encrypt 39 0 R
  /ID [<9547E63093BB6E15DD0C774EE9396538> <9547E63093BB6E15DD0C774EE9396538>]
>>
39 0 obj
<<
  /Filter /Standard
  /V 4
  /R 4
  /CF <<
    /StdCF <<
      /CFM /AESV2
      /AuthEvent /DocOpen
      /Length 16
    >>
  >>
  /StrF /StdCF
  /StmF /StdCF
  /Length 128
  /P -1028
  /O <A8E2C41E5EB755B8090429A41CABBA3FB276681D4869B19249296FE0F1F72A8B>
  /U <54DEADD359AA22CEA20C08B86E547BF428BF4E5E4E758A4164004E56FFFA0108>
>>
endobj
      `;
      const base64 = Buffer.from(mockPdf, 'latin1').toString('base64');
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(base64);

      const result = await parseBankStatementPdf('file:///test_aes.pdf', { password: 'wrongpassword' });
      expect(result.isEncrypted).toBe(true);
      expect(result.success).toBe(false);
      // Confirms /O and /U were reached inside nested crypt filter dict and evaluated
      expect(result.errors[0]).toContain('Incorrect password');
    });

    it('parses unencrypted PDF with FlateDecode compressed streams', async () => {
      const streamContent = 'BT (01/08/2024 Uber Trip 250.00 5,000.00) Tj ET';
      const compressed = pako.deflate(Buffer.from(streamContent, 'latin1'));
      const compressedStr = Buffer.from(compressed).toString('binary');

      const mockPdf = `%PDF-1.4\n2 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${compressedStr}\nendstream\nendobj\n`;
      const base64 = Buffer.from(mockPdf, 'binary').toString('base64');
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(base64);

      const result = await parseBankStatementPdf('file:///unencrypted.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].date).toBe('2024-08-01');
      expect(result.transactions[0].amount).toBe(250);
      expect(result.transactions[0].category).toBe('Transport');
    });

    it('reconstructs horizontal rows across separate Tm operators with coordinate alignment', async () => {
      const streamContent = `
BT
1 0 0 1 50 720 Tm (15-Oct-24) Tj
1 0 0 1 140 720 Tm (15-Oct-24) Tj
1 0 0 1 220 720 Tm (TRANSFER TO SWIGGY) Tj
1 0 0 1 420 720 Tm (540.00) Tj
1 0 0 1 480 720 Tm (0.00) Tj
1 0 0 1 540 720 Tm (35,420.00) Tj
ET
BT
1 0 0 1 50 690 Tm (18.10.2024) Tj
1 0 0 1 140 690 Tm (18.10.2024) Tj
1 0 0 1 220 690 Tm (BY TRANSFER SALARY OCT) Tj
1 0 0 1 420 690 Tm (0.00) Tj
1 0 0 1 480 690 Tm (65,000.00) Tj
1 0 0 1 540 690 Tm (1,00,420.00) Tj
ET
`;
      const compressed = pako.deflate(Buffer.from(streamContent, 'latin1'));
      const compressedStr = Buffer.from(compressed).toString('binary');

      const mockPdf = `%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${compressedStr}\nendstream\nendobj\n`;
      // Insert newlines in base64 to test whitespace tolerance
      const rawBase64 = Buffer.from(mockPdf, 'binary').toString('base64');
      const base64WithNewlines = rawBase64.slice(0, 10) + '\r\n ' + rawBase64.slice(10);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(base64WithNewlines);

      const result = await parseBankStatementPdf('file:///sbi_coords.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);

      // Row 1: expense
      expect(result.transactions[0].date).toBe('2024-10-15');
      expect(result.transactions[0].amount).toBe(540);
      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[0].balance).toBe(35420);

      // Row 2: income
      expect(result.transactions[1].date).toBe('2024-10-18');
      expect(result.transactions[1].amount).toBe(65000);
      expect(result.transactions[1].type).toBe('income');
      expect(result.transactions[1].balance).toBe(100420);
    });
  });

  describe('SUPPORTED_BANK_PROFILES', () => {
    it('contains major Indian banks with password hints', () => {
      const ids = SUPPORTED_BANK_PROFILES.map((p) => p.id);
      expect(ids).toContain('auto');
      expect(ids).toContain('hdfc');
      expect(ids).toContain('sbi');
      expect(ids).toContain('icici');
      expect(ids).toContain('axis');
      expect(ids).toContain('kotak');
    });
  });
});

