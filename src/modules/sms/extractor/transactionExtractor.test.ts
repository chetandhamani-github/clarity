import { TransactionExtractor } from './transactionExtractor';
import type { RawSmsMessage } from '@/modules/sms/types';

describe('TransactionExtractor', () => {
  it('extracts amount, type, and accountMask accurately', () => {
    const msg: RawSmsMessage = {
      id: '1',
      address: 'VM-HDFCBK',
      body: 'Rs.500.00 debited from A/c XX1234 on 15-Jan-25 to Swiggy. Avl Bal Rs.10,250.00',
      date: 1705315200000,
    };

    const res = TransactionExtractor.extract(msg);
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(500);
    expect(res?.type).toBe('DEBIT');
    expect(res?.accountMask).toBe('1234');
    expect(res?.bank).toBe('HDFC Bank');
    expect(res?.availableBalance).toBe(10250);
  });

  it('extracts comma-formatted numbers and decimals', () => {
    const msg: RawSmsMessage = {
      id: '2',
      address: 'AD-ICICIB',
      body: 'Acct XX5678 debited for INR 1,499.50 on 10-Jan-25 at Amazon India. Avl Bal INR 45,000.00',
      date: 1705315200000,
    };

    const res = TransactionExtractor.extract(msg);
    expect(res?.amount).toBe(1499.5);
    expect(res?.availableBalance).toBe(45000);
    expect(res?.accountMask).toBe('5678');
    expect(res?.bank).toBe('ICICI Bank');
  });

  it('extracts reference number (UPI Ref / UTR / RRN)', () => {
    const msg: RawSmsMessage = {
      id: '3',
      address: 'VK-SBIINB',
      body: 'A/C 9988 debited by 750.0 on 12Jan25 trf to Zomato UPI Ref No 402918273612',
      date: 1705315200000,
    };

    const res = TransactionExtractor.extract(msg);
    expect(res?.amount).toBe(750);
    expect(res?.referenceNumber).toBe('402918273612');
    expect(res?.merchant).toBe('Zomato');
  });

  it('extracts credit transactions correctly', () => {
    const msg: RawSmsMessage = {
      id: '4',
      address: 'AXISBK',
      body: 'INR 15,000.00 credited to Axis Bank A/C XX3344 on 01-Jan-25 by Infosys Ltd. Avl Bal INR 85,000.00',
      date: 1705315200000,
    };

    const res = TransactionExtractor.extract(msg);
    expect(res?.type).toBe('CREDIT');
    expect(res?.amount).toBe(15000);
    expect(res?.accountMask).toBe('3344');
    expect(res?.bank).toBe('Axis Bank');
  });
});
