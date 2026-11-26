import {
  checkIsPdfEncrypted,
  parseBankStatementPdfText,
  parseBankStatementPdf,
  SUPPORTED_BANK_PROFILES,
} from './pdf-statement-parser';
import * as FileSystem from 'expo-file-system/legacy';
import forge from 'node-forge';
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

    it('decodes Identity-H CIDFont hex streams using embedded /ToUnicode CMap', async () => {
      const cmapContent = `
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
1 beginbfrange
<0001> <000A> <0030>
endbfrange
6 beginbfchar
<000B> <002F>
<000C> <0020>
<000D> <0053>
<000E> <0057>
<000F> <0049>
<0010> <002E>
endbfchar
endcmap
`;
      const compressedCmap = pako.deflate(Buffer.from(cmapContent, 'latin1'));

      // 01/05/2024 SW 500.00
      const content = 'BT <00010002000B00010006000B0003000100030005000C000D000E000C000600010001001000010001> Tj ET';
      const compressedContent = pako.deflate(Buffer.from(content, 'latin1'));

      const mockPdf = `%PDF-1.4
1 0 obj
<< /Type /CMap /Length ${compressedCmap.length} /Filter /FlateDecode >>
stream
${Buffer.from(compressedCmap).toString('binary')}
endstream
endobj
2 0 obj
<< /Length ${compressedContent.length} /Filter /FlateDecode >>
stream
${Buffer.from(compressedContent).toString('binary')}
endstream
endobj
`;
      const base64 = Buffer.from(mockPdf, 'binary').toString('base64');
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(base64);

      const result = await parseBankStatementPdf('file:///cmap_test.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].date).toBe('2024-05-01');
      expect(result.transactions[0].amount).toBe(500);
      expect(result.transactions[0].merchant).toBe('SW');
    });

    it('unlocks AES-128 (/V 4 /R 4) encrypted PDF when /CF << /Length 16 >> precedes /Length 128', async () => {
      const password = '98872030899';
      const idBytes = Buffer.from('9547e63093bb6e15dd0c774ee9396538', 'hex');
      const pad = Buffer.from([
        0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
        0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
      ]);

      const rc4Enc = (key: Buffer, data: Buffer): Buffer => {
        const s = Array.from({ length: 256 }, (_, i) => i);
        let j = 0;
        for (let i = 0; i < 256; i++) {
          j = (j + s[i] + key[i % key.length]) & 255;
          [s[i], s[j]] = [s[j], s[i]];
        }
        let i = 0;
        j = 0;
        const out = Buffer.alloc(data.length);
        for (let k = 0; k < data.length; k++) {
          i = (i + 1) & 255;
          j = (j + s[i]) & 255;
          [s[i], s[j]] = [s[j], s[i]];
          out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
        }
        return out;
      };

      const oValue = Buffer.alloc(32, 0xaa);
      const pValue = -1028;
      const pBuf = Buffer.alloc(4);
      pBuf.writeInt32LE(pValue, 0);

      const pwdPadded = Buffer.concat([Buffer.from(password, 'latin1'), pad]).subarray(0, 32);
      let md = forge.md.md5.create();
      md.update(pwdPadded.toString('binary'));
      md.update(oValue.toString('binary'));
      md.update(pBuf.toString('binary'));
      md.update(idBytes.toString('binary'));
      let encKey = Buffer.from(md.digest().getBytes(), 'binary');
      for (let i = 0; i < 50; i++) {
        const iter = forge.md.md5.create();
        iter.update(encKey.subarray(0, 16).toString('binary'));
        encKey = Buffer.from(iter.digest().getBytes(), 'binary');
      }
      encKey = encKey.subarray(0, 16);

      const uMd5 = forge.md.md5.create();
      uMd5.update(pad.toString('binary'));
      uMd5.update(idBytes.toString('binary'));
      let uData: Buffer = Buffer.from(uMd5.digest().getBytes(), 'binary');
      for (let i = 0; i < 20; i++) {
        const k = Buffer.from(encKey.map((b: number) => b ^ i));
        uData = rc4Enc(k, uData);
      }
      const uValue = Buffer.concat([uData, Buffer.alloc(16, 0)]);

      // Encrypt content stream with object 2 gen 0 AES-128 key + sAlT
      const streamPlain = Buffer.from(
        pako.deflate(
          Buffer.from(
            'q 1 0 0 1 50 700 cm BT 0 0 Td (01 Nov, 2026) Tj 120 0 Td (UPI/Swiggy \\(Order 1\\)) Tj 200 0 Td (450.00\\(Dr\\) 12,550.00\\(Cr\\)) Tj ET Q',
            'latin1'
          )
        )
      );
      const objMd = forge.md.md5.create();
      objMd.update(
        Buffer.concat([encKey, Buffer.from([2, 0, 0, 0, 0]), Buffer.from('sAlT', 'latin1')]).toString('binary')
      );
      const objKey = Buffer.from(objMd.digest().getBytes(), 'binary').subarray(0, 16);
      const iv = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      const cipher = forge.cipher.createCipher('AES-CBC', objKey.toString('binary'));
      cipher.start({ iv: iv.toString('binary') });
      cipher.update(forge.util.createBuffer(streamPlain.toString('binary')));
      cipher.finish();
      const encryptedStream = Buffer.concat([iv, Buffer.from(cipher.output.getBytes(), 'binary')]);

      const mockPdf = `%PDF-1.6
trailer
<< /Encrypt 1 0 R /ID [<9547e63093bb6e15dd0c774ee9396538> <9547e63093bb6e15dd0c774ee9396538>] >>
1 0 obj
<< /Filter /Standard /V 4 /R 4 /CF << /StdCF << /CFM /AESV2 /Length 16 >> >> /Length 128 /P -1028 /O <${oValue.toString('hex')}> /U <${uValue.toString('hex')}> >>
endobj
2 0 obj
<< /Length ${encryptedStream.length} /Filter /FlateDecode >>
stream
${encryptedStream.toString('binary')}
endstream
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///aes128_kotak.pdf', { password });
      expect(result.isEncrypted).toBe(false);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-11-01',
        amount: 450,
        type: 'expense',
        balance: 12550,
      });
    });

    it('unlocks AES-256 (/V 5 /R 5) encrypted PDF statements', async () => {
      const password = 'secret256';
      const valSalt = Buffer.from('1122334455667788', 'hex');
      const keySalt = Buffer.from('8877665544332211', 'hex');
      const fileKey = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');

      const sha = (buf: Buffer) => {
        const md = forge.md.sha256.create();
        md.update(buf.toString('binary'));
        return Buffer.from(md.digest().getBytes(), 'binary');
      };

      const uCheck = sha(Buffer.concat([Buffer.from(password, 'utf8'), valSalt]));
      const uValue = Buffer.concat([uCheck, valSalt, keySalt]);
      const kek = sha(Buffer.concat([Buffer.from(password, 'utf8'), keySalt]));

      const zeroIv = Buffer.alloc(16, 0);
      const ueCipher = forge.cipher.createCipher('AES-CBC', kek.toString('binary'));
      (ueCipher.mode as unknown as { pad?: () => boolean }).pad = () => true;
      ueCipher.start({ iv: zeroIv.toString('binary') });
      ueCipher.update(forge.util.createBuffer(fileKey.toString('binary')));
      ueCipher.finish();
      const ueValue = Buffer.from(ueCipher.output.getBytes(), 'binary');

      const streamPlain = Buffer.from(
        pako.deflate(Buffer.from('BT 1 0 0 1 40 700 Tm (15/11/2026 Zomato 325.00 9,675.00) Tj ET', 'latin1'))
      );
      const iv = Buffer.from('fedcba9876543210fedcba9876543210', 'hex');
      const sCipher = forge.cipher.createCipher('AES-CBC', fileKey.toString('binary'));
      sCipher.start({ iv: iv.toString('binary') });
      sCipher.update(forge.util.createBuffer(streamPlain.toString('binary')));
      sCipher.finish();
      const encryptedStream = Buffer.concat([iv, Buffer.from(sCipher.output.getBytes(), 'binary')]);

      const mockPdf = `%PDF-1.7
1 0 obj
<< /Filter /Standard /V 5 /R 5 /Length 256 /P -1028 /O <${'00'.repeat(48)}> /U <${uValue.toString('hex')}> /UE <${ueValue.toString('hex')}> >>
endobj
2 0 obj
<< /Length ${encryptedStream.length} /Filter /FlateDecode >>
stream
${encryptedStream.toString('binary')}
endstream
endobj
trailer << /Encrypt 1 0 R >>
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///aes256.pdf', { password });
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-11-15',
        amount: 325,
        type: 'expense',
        balance: 9675,
      });
    });

    it('decodes literal CID strings and keeps non-CMap WinAnsi fonts isolated', async () => {
      const cmapContent = `
begincmap
1 begincodespacerange
<0001> <00FF>
endcodespacerange
4 beginbfchar
<0001> <0055>
<0002> <0050>
<0003> <0049>
<0004> <005A>
endbfchar
endcmap
`;
      const compressedCmap = pako.deflate(Buffer.from(cmapContent, 'latin1'));
      // /F1 is WinAnsi (no ToUnicode), /F2 uses ToUnicode 10 0 R
      const content =
        'BT /F1 10 Tf 50 700 Tm (01/11/2026) Tj /F2 10 Tf 140 700 Tm (\\000\\001\\000\\002\\000\\003\\000\\004) Tj /F1 10 Tf 300 700 Tm (500.00 9,500.00) Tj ET';
      const compressedContent = pako.deflate(Buffer.from(content, 'latin1'));

      const mockPdf = `%PDF-1.5
10 0 obj
<< /Type /CMap /Length ${compressedCmap.length} /Filter /FlateDecode >>
stream
${Buffer.from(compressedCmap).toString('binary')}
endstream
endobj
11 0 obj
<< /Type /Font /Subtype /TrueType /Encoding /WinAnsiEncoding >>
endobj
12 0 obj
<< /Type /Font /Subtype /Type0 /ToUnicode 10 0 R >>
endobj
13 0 obj
<< /Type /Page /Resources << /Font << /F1 11 0 R /F2 12 0 R >> >> >>
endobj
14 0 obj
<< /Length ${compressedContent.length} /Filter /FlateDecode >>
stream
${Buffer.from(compressedContent).toString('binary')}
endstream
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///mixed_fonts.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-11-01',
        merchant: 'UPIZ',
        amount: 500,
        balance: 9500,
      });
    });

    it('parses multi-line wrapped rows and does not misclassify debits when balance has (Cr)', () => {
      const wrappedStatement = `
        01 Nov, 2026 UPI/412345678901/SWIGGY
        FOOD ORDER REF 9911 450.00(Dr) 12,550.00(Cr)
        03/Nov/2026 NEFT SALARY CREDIT 50,000.00(Cr) 62,550.00(Cr)
      `;
      const result = parseBankStatementPdfText(wrappedStatement);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-11-01',
        amount: 450,
        type: 'expense',
        balance: 12550,
      });
      expect(result.transactions[1]).toMatchObject({
        date: '2026-11-03',
        amount: 50000,
        type: 'income',
        balance: 62550,
      });
    });

    it('does not hang on stray braces/brackets or binary image streams in PDF content', async () => {
      const streamWithStrayDelimiters =
        '} { ] ) > /DeviceRGB cs BT 1 0 0 1 50 700 Tm (05/11/2026 Uber Trip 250.00 5,000.00) Tj ET }';
      const compressed = pako.deflate(Buffer.from(streamWithStrayDelimiters, 'latin1'));
      const imageBinary = Buffer.from([0x7d, 0x7b, 0x5d, 0x29, 0x3e, 0x00, 0xff]);

      const mockPdf = `%PDF-1.5
1 0 obj
<< /Subtype /Image /Length ${imageBinary.length} >>
stream
${imageBinary.toString('binary')}
endstream
endobj
2 0 obj
<< /Length ${compressed.length} /Filter /FlateDecode >>
stream
${Buffer.from(compressed).toString('binary')}
endstream
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///stray_delims.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount).toBe(250);
    });

    it('parses SBI statement with Value Date line, 6-line wrap, split year, and C/D suffixes', () => {
      const sbiText = `
        Txn Date   Value Date   Description   Debit   Credit   Balance
        1 Apr
        2026 TO TRANSFER-UPI/DR
        01 Apr 2026
        412345678901/SWIGGY
        HDFC/swiggypay@hdfc
        REF NO UPI889911
        450.00D 45,455.50C
        02 Apr 2026 02 Apr 2026 BY TRANSFER-NEFT SALARY 25,000.00C 70,455.50C
      `;
      const result = parseBankStatementPdfText(sbiText);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-04-01',
        amount: 450,
        type: 'expense',
        balance: 45455.5,
      });
      expect(result.transactions[1]).toMatchObject({
        date: '2026-04-02',
        amount: 25000,
        type: 'income',
        balance: 70455.5,
      });
    });

    it('isolates per-page /F1 font collisions when Type1 font omits /Type /Font', async () => {
      const cmapStream = `
begincmap
1 beginbfchar
<0001> <0058>
endbfchar
endcmap
`;
      const page1Content = 'BT /F1 12 Tf 1 0 0 1 50 750 Tm <0001> Tj ET';
      const page2Content =
        'BT /F1 10 Tf 1 0 0 1 40 680 Tm (01/04/2026 SBI YONO SWIGGY 320.00 12,180.00) Tj ET';

      const mockPdf = `%PDF-1.6
1 0 obj
<< /Type /CMap /Length ${cmapStream.length} >>
stream
${cmapStream}
endstream
endobj
2 0 obj
<< /Type /Font /Subtype /Type0 /ToUnicode 1 0 R >>
endobj
3 0 obj
<< /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>
endobj
4 0 obj
<< /Length ${page1Content.length} >>
stream
${page1Content}
endstream
endobj
5 0 obj
<< /Length ${page2Content.length} >>
stream
${page2Content}
endstream
endobj
6 0 obj
<< /Type /Page /Resources << /Font << /F1 2 0 R >> >> /Contents 4 0 R >>
endobj
7 0 obj
<< /Type /Page /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///sbi_per_page_font.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-04-01',
        amount: 320,
        balance: 12180,
      });
    });

    it('decodes custom /Encoding /Differences font without /ToUnicode', async () => {
      // Codes: 1:'0', 2:'1', 3:'/', 4:'4', 5:'2', 6:'6', 7:' ', 8:'S', 9:'B', 10:'I', 11:'5', 12:'.'
      const streamBytes = Buffer.concat([
        Buffer.from('BT /F3 10 Tf 1 0 0 1 50 700 Tm (', 'latin1'),
        Buffer.from([1, 2, 3, 1, 4, 3, 5, 1, 5, 6, 7, 8, 9, 10, 7, 11, 1, 1, 12, 1, 1, 7, 11, 1, 1, 1, 12, 1, 1]),
        Buffer.from(') Tj ET', 'latin1'),
      ]);

      const mockPdf = `%PDF-1.4
1 0 obj
<< /Type /Font /Subtype /Type1 /Encoding << /Type /Encoding /Differences [1 /zero /one /slash /four /two /six /space /S /B /I /five /period] >> >>
endobj
2 0 obj
<< /Length ${streamBytes.length} >>
stream
${streamBytes.toString('binary')}
endstream
endobj
3 0 obj
<< /Type /Page /Resources << /Font << /F3 1 0 R >> >> /Contents 2 0 R >>
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///diff_encoding.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-04-01',
        merchant: 'SBI',
        amount: 500,
        balance: 5000,
      });
    });

    it('extracts rotated 90-degree landscape table rows via vertical coordinate grouping', async () => {
      const rotatedStream = [
        'q 0 1 -1 0 550 40 cm',
        'BT /F1 10 Tf 1 0 0 1 20 500 Tm (05/04/2026) Tj ET',
        'BT /F1 10 Tf 1 0 0 1 120 500 Tm (ATM CASH WDL) Tj ET',
        'BT /F1 10 Tf 1 0 0 1 320 500 Tm (2,000.00) Tj ET',
        'BT /F1 10 Tf 1 0 0 1 420 500 Tm (18,000.00) Tj ET',
        'Q',
      ].join('\n');

      const mockPdf = `%PDF-1.4
1 0 obj
<< /Subtype /Type1 /BaseFont /Helvetica >>
endobj
2 0 obj
<< /Length ${rotatedStream.length} >>
stream
${rotatedStream}
endstream
endobj
3 0 obj
<< /Type /Page /Resources << /Font << /F1 1 0 R >> >> /Contents 2 0 R >>
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///rotated_sbi.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-04-05',
        amount: 2000,
        balance: 18000,
      });
    });

    const rc4EncryptTest = (key: Buffer, data: Buffer): Buffer => {
      const S = Array.from({ length: 256 }, (_, idx) => idx);
      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (j + S[i] + key[i % key.length]) & 0xff;
        const tmp = S[i];
        S[i] = S[j];
        S[j] = tmp;
      }
      const out = Buffer.alloc(data.length);
      let a = 0;
      let b = 0;
      for (let k = 0; k < data.length; k++) {
        a = (a + 1) & 0xff;
        b = (b + S[a]) & 0xff;
        const tmp = S[a];
        S[a] = S[b];
        S[b] = tmp;
        out[k] = data[k] ^ S[(S[a] + S[b]) & 0xff];
      }
      return out;
    };

    const PDF_PWD_PAD_TEST = Buffer.from([
      0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
      0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
    ]);

    it('unlocks RC4-128 (/V 2 /R 3) SBI-style 11-digit account password PDF', async () => {
      const password = '00123456789';
      const id1 = Buffer.from('a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex');
      const oValue = Buffer.alloc(32, 0x33);
      const pInt = -4;
      const pBytes = Buffer.alloc(4);
      pBytes.writeInt32LE(pInt, 0);

      const paddedPwd = Buffer.concat([Buffer.from(password, 'latin1'), PDF_PWD_PAD_TEST]).subarray(0, 32);
      const md5 = forge.md.md5.create();
      md5.update(paddedPwd.toString('binary'));
      md5.update(oValue.toString('binary'));
      md5.update(pBytes.toString('binary'));
      md5.update(id1.toString('binary'));
      let hash = Buffer.from(md5.digest().getBytes(), 'binary');
      for (let i = 0; i < 50; i++) {
        const iter = forge.md.md5.create();
        iter.update(hash.subarray(0, 16).toString('binary'));
        hash = Buffer.from(iter.digest().getBytes(), 'binary');
      }
      const encKey = hash.subarray(0, 16);

      const uMd5 = forge.md.md5.create();
      uMd5.update(PDF_PWD_PAD_TEST.toString('binary'));
      uMd5.update(id1.toString('binary'));
      let uData = Buffer.from(uMd5.digest().getBytes(), 'binary');
      for (let i = 0; i < 20; i++) {
        const roundKey = Buffer.from(encKey.map((b: number) => b ^ i));
        uData = rc4EncryptTest(roundKey, uData);
      }
      const uValue = Buffer.concat([uData, Buffer.alloc(16, 0)]);

      const objMd5 = forge.md.md5.create();
      objMd5.update(encKey.toString('binary'));
      objMd5.update(Buffer.from([2, 0, 0, 0, 0]).toString('binary'));
      const objKey = Buffer.from(objMd5.digest().getBytes(), 'binary').subarray(0, 16);

      const plainStream = 'BT /F1 10 Tf 1 0 0 1 40 700 Tm (07 Apr 2026 BY TRANSFER NEFT 15,000.00 33,000.00) Tj ET';
      const flate = Buffer.from(pako.deflate(Buffer.from(plainStream, 'latin1')));
      const encryptedStream = rc4EncryptTest(objKey, flate);

      const mockPdf = `%PDF-1.4
1 0 obj
<< /Subtype /Type1 /BaseFont /Helvetica >>
endobj
3 0 obj
${encryptedStream.length}
endobj
2 0 obj
<< /Length 3 0 R /Filter /FlateDecode >>
stream
${encryptedStream.toString('binary')}
endstream
endobj
4 0 obj
<< /Filter /Standard /V 2 /R 3 /Length 128 /P ${pInt} /O <${oValue.toString('hex')}> /U <${uValue.toString('hex')}> >>
endobj
trailer
<< /Root 5 0 R /Encrypt 4 0 R /ID [<${id1.toString('hex')}> <${id1.toString('hex')}>] >>
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///sbi_rc4_128.pdf', {
        password: ' 00123456789 ',
      });
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-04-07',
        amount: 15000,
        type: 'income',
        balance: 33000,
      });
    });

    it('decodes /LZWDecode compressed PDF streams alongside RC4-40 (/V 1 /R 2) encryption', async () => {
      const encodeLzw9Bit = (input: Buffer): Buffer => {
        const codes: number[] = [256];
        for (let idx = 0; idx < input.length; idx++) {
          codes.push(input[idx]);
        }
        codes.push(257);
        const bytes: number[] = [];
        let acc = 0;
        let bits = 0;
        for (const c of codes) {
          acc = (acc << 9) | (c & 0x1ff);
          bits += 9;
          while (bits >= 8) {
            bits -= 8;
            bytes.push((acc >> bits) & 0xff);
          }
        }
        if (bits > 0) {
          bytes.push((acc << (8 - bits)) & 0xff);
        }
        return Buffer.from(bytes);
      };

      const password = '98765432101';
      const id1 = Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex');
      const oValue = Buffer.alloc(32, 0x44);
      const pInt = -4;
      const pBytes = Buffer.alloc(4);
      pBytes.writeInt32LE(pInt, 0);

      const paddedPwd = Buffer.concat([Buffer.from(password, 'latin1'), PDF_PWD_PAD_TEST]).subarray(0, 32);
      const md5 = forge.md.md5.create();
      md5.update(paddedPwd.toString('binary'));
      md5.update(oValue.toString('binary'));
      md5.update(pBytes.toString('binary'));
      md5.update(id1.toString('binary'));
      const encKey = Buffer.from(md5.digest().getBytes(), 'binary').subarray(0, 5);
      const uValue = rc4EncryptTest(encKey, PDF_PWD_PAD_TEST);

      const objMd5 = forge.md.md5.create();
      objMd5.update(encKey.toString('binary'));
      objMd5.update(Buffer.from([2, 0, 0, 0, 0]).toString('binary'));
      const objKey = Buffer.from(objMd5.digest().getBytes(), 'binary').subarray(0, 10);

      const plainStream = 'BT /F1 10 Tf 1 0 0 1 40 700 Tm (08 Apr 2026 ZOMATO UPI 350.00 12,000.00) Tj ET';
      const lzwCompressed = encodeLzw9Bit(Buffer.from(plainStream, 'latin1'));
      const encryptedStream = rc4EncryptTest(objKey, lzwCompressed);

      const mockPdf = `%PDF-1.3
1 0 obj
<< /Subtype /Type1 /BaseFont /Helvetica >>
endobj
2 0 obj % SBI content stream
<< /Length ${encryptedStream.length} /Filter /LZWDecode /Producer <AABBCC>>>
stream
${encryptedStream.toString('binary')}
endstream
endobj
3 0 obj
<< /Filter /Standard /V 1 /R 2 /P ${pInt} /O <${oValue.toString('hex')}> /U <${uValue.toString('hex')}> >>
endobj
trailer
<< /Root 4 0 R /Encrypt 3 0 R /ID [<${id1.toString('hex')}> <${id1.toString('hex')}>] >>
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///sbi_rc4_40_lzw.pdf', {
        password,
      });
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-04-08',
        amount: 350,
        type: 'expense',
        balance: 12000,
      });
    });

    it('reports image-only PDF diagnostics when no selectable text streams exist', async () => {
      const mockPdf = `%PDF-1.4
1 0 obj
<< /Subtype /Image /Width 100 /Height 100 /Length 4 >>
stream
\x01\x02\x03\x04
endstream
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///scanned_img.pdf');
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('only contains images without selectable text');
      expect(result.errors[0]).toContain('img=1, decFail=0, bt=0');
    });

    it('falls back to pure-JS DEFLATE decoder when pako.inflate and pako.inflateRaw fail', async () => {
      // Dynamic Huffman stream with repeated LZ77 runs (> 1KB so dynamic trees are emitted)
      const txLines = Array.from({ length: 18 }, (_, idx) => {
        const y = 700 - idx * 14;
        return `BT /F1 10 Tf 1 0 0 1 40 ${y} Tm (01/04/2026 SBI YONO SWIGGY ORDER 450.00 12,000.00) Tj ET`;
      }).join('\n');
      const zlibBytes = Buffer.from(pako.deflate(Buffer.from(txLines, 'latin1')));

      const mockPdf = `%PDF-1.5
1 0 obj
<< /Subtype /Type1 /BaseFont /Helvetica >>
endobj
2 0 obj
<< /Length ${zlibBytes.length} /Filter /FlateDecode >>
stream
${zlibBytes.toString('binary')}
endstream
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const inflateSpy = jest.spyOn(pako, 'inflate').mockImplementation(() => {
        throw new Error('Hermes simulated inflate failure');
      });
      const inflateRawSpy = jest.spyOn(pako, 'inflateRaw').mockImplementation(() => {
        throw new Error('Hermes simulated inflateRaw failure');
      });

      try {
        const result = await parseBankStatementPdf('file:///pure_js_inflate.pdf');
        expect(result.success).toBe(true);
        expect(result.transactions).toHaveLength(18);
        expect(result.transactions[0]).toMatchObject({
          date: '2026-04-01',
          amount: 450,
          balance: 12000,
        });
      } finally {
        inflateSpy.mockRestore();
        inflateRawSpy.mockRestore();
      }
    });

    it('decompresses zlib streams with corrupted ADLER32 trailer bytes', async () => {
      const content = 'BT /F1 10 Tf 1 0 0 1 40 700 Tm (09 Apr 2026 UPI AMAZON 999.00 8,001.00) Tj ET';
      const zlibBytes = Buffer.from(pako.deflate(Buffer.from(content, 'latin1')));
      zlibBytes[zlibBytes.length - 1] ^= 0xff; // Corrupt ADLER32 checksum

      const mockPdf = `%PDF-1.4
1 0 obj
<< /Subtype /Type1 /BaseFont /Helvetica >>
endobj
2 0 obj
<< /Length ${zlibBytes.length} /Filter /FlateDecode >>
stream
${zlibBytes.toString('binary')}
endstream
endobj
`;
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        Buffer.from(mockPdf, 'binary').toString('base64')
      );

      const result = await parseBankStatementPdf('file:///bad_adler.pdf');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-04-09',
        amount: 999,
        balance: 8001,
      });
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

