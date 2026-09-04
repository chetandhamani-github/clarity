import { ParserRegistry } from './parserRegistry';
import type { RawSmsMessage, IBankParser } from '@/modules/sms/types';

describe('Bank Parsers & ParserRegistry', () => {
  const createMsg = (address: string, body: string): RawSmsMessage => ({
    id: 'test-1',
    address,
    body,
    date: 1705315200000,
  });

  it('parses HDFC Bank SMS', () => {
    const msg = createMsg(
      'VM-HDFCBK',
      'Rs.450.00 debited from HDFC Bank A/c **4321 on 15-Jan-25 to VPA swiggy@hdfcbank'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('HDFC Bank');
    expect(res?.amount).toBe(450);
    expect(res?.accountMask).toBe('4321');
    expect(res?.merchant).toBe('swiggy@hdfcbank');
  });

  it('parses ICICI Bank SMS', () => {
    const msg = createMsg(
      'AD-ICICIB',
      'Acct XX987 debited for Rs 899.00 on 10-Jan-25; Netflix credited. Avl Bal Rs 20,000.00'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('ICICI Bank');
    expect(res?.amount).toBe(899);
    expect(res?.accountMask).toBe('987');
    expect(res?.merchant).toBe('Netflix');
  });

  it('parses State Bank of India (SBI) SMS', () => {
    const msg = createMsg(
      'VK-SBIINB',
      'Dear SBI User, A/C 6543 debited by 320.0 on 05Jan25 trf to Uber India Ref No 9876543210'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('State Bank of India');
    expect(res?.amount).toBe(320);
    expect(res?.accountMask).toBe('6543');
    expect(res?.merchant).toBe('Uber India');
    expect(res?.referenceNumber).toBe('9876543210');
  });

  it('parses Axis Bank SMS', () => {
    const msg = createMsg(
      'AXISBK',
      'Axis Bank A/C XX7788 debited with INR 1,200.00 on 14-01-25 info: Flipkart Internet Avl Bal INR 15,000'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('Axis Bank');
    expect(res?.amount).toBe(1200);
    expect(res?.accountMask).toBe('7788');
    expect(res?.merchant).toBe('Flipkart Internet');
  });

  it('parses Kotak Mahindra Bank SMS', () => {
    const msg = createMsg(
      'KOTAKB',
      'Sent Rs.250.00 from Kotak Bank AC XX1122 to Starbucks Coffee on 12-Jan-25. Ref 392819283712'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('Kotak Mahindra Bank');
    expect(res?.amount).toBe(250);
    expect(res?.accountMask).toBe('1122');
    expect(res?.merchant).toBe('Starbucks Coffee');
  });

  it('parses IDFC FIRST Bank SMS', () => {
    const msg = createMsg(
      'IDFCFB',
      'Rs.1,500.00 debited from IDFC FIRST Bank A/C XX4433 to Amazon Pay on 10-Jan-25'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('IDFC FIRST Bank');
    expect(res?.amount).toBe(1500);
    expect(res?.accountMask).toBe('4433');
    expect(res?.merchant).toBe('Amazon Pay');
  });

  it('parses AU Small Finance Bank SMS', () => {
    const msg = createMsg(
      'AUBANK',
      'AU Bank: A/c **8899 debited by INR 600.00 on 08-Jan-25 towards Blinkit'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('AU Small Finance Bank');
    expect(res?.amount).toBe(600);
    expect(res?.accountMask).toBe('8899');
    expect(res?.merchant).toBe('Blinkit');
  });

  it('parses Federal Bank SMS', () => {
    const msg = createMsg(
      'FEDBNK',
      'Federal Bank: A/c XX3322 debited for Rs 350.00 at CCD Cafe on 02-Jan-25'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('Federal Bank');
    expect(res?.amount).toBe(350);
    expect(res?.accountMask).toBe('3322');
    expect(res?.merchant).toBe('CCD Cafe');
  });

  it('parses IndusInd Bank SMS', () => {
    const msg = createMsg(
      'INDBNK',
      'IndusInd Bank: INR 780.00 debited from A/C XX5544 on 04-Jan at McDonald on 04-Jan'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('IndusInd Bank');
    expect(res?.amount).toBe(780);
    expect(res?.accountMask).toBe('5544');
    expect(res?.merchant).toBe('McDonald');
  });

  it('parses Canara Bank SMS', () => {
    const msg = createMsg(
      'CANBNK',
      'Canara Bank: Dear Customer, your A/c XX6677 debited for Rs 550.00 towards Dominos Pizza on 03-Jan-25'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('Canara Bank');
    expect(res?.amount).toBe(550);
    expect(res?.accountMask).toBe('6677');
    expect(res?.merchant).toBe('Dominos Pizza');
  });

  it('parses Bank of Baroda (BOB) SMS', () => {
    const msg = createMsg(
      'BOBTXN',
      'BOB: Your A/C XX9911 debited by Rs. 850.00 on 06-Jan-25 to Apollo Pharmacy'
    );
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('Bank of Baroda');
    expect(res?.amount).toBe(850);
    expect(res?.accountMask).toBe('9911');
    expect(res?.merchant).toBe('Apollo Pharmacy');
  });

  it('falls back gracefully to GenericBankParser for unknown sender header', () => {
    const msg = createMsg(
      'XYZ-UNKNOWN',
      'Rs.1,200.00 debited from A/c XX9999 on 01-Jan-25 to DTH Recharge'
    );
    const res = ParserRegistry.parse(msg);
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(1200);
    expect(res?.accountMask).toBe('9999');
    expect(res?.type).toBe('DEBIT');
  });

  it('allows registering a custom bank parser with high priority', () => {
    const customParser: IBankParser = {
      bankId: 'MY_CUSTOM_BANK',
      bankName: 'My Custom Bank',
      canHandle: (m) => m.address.includes('CUSTOM'),
      parse: (m) => ({
        amount: 9999,
        type: 'DEBIT',
        merchant: 'Custom Merchant',
        bank: 'My Custom Bank',
        accountMask: '7777',
        timestamp: m.date,
      }),
    };

    ParserRegistry.register(customParser);

    const msg = createMsg('CUSTOMBK', 'Some custom notification');
    const res = ParserRegistry.parse(msg);
    expect(res?.bank).toBe('My Custom Bank');
    expect(res?.amount).toBe(9999);
    expect(res?.accountMask).toBe('7777');

    ParserRegistry.resetDefaults();
  });
});
