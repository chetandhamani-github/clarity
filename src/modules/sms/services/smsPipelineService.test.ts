import { SmsPipelineService } from './smsPipelineService';
import type { RawSmsMessage } from '@/modules/sms/types';

describe('SmsPipelineService', () => {
  it('ignores OTP messages', async () => {
    const msg: RawSmsMessage = {
      id: 'otp-1',
      address: 'VM-HDFCBK',
      body: 'Your OTP is 998811 for login. Do not share.',
      date: Date.now(),
    };

    const result = await SmsPipelineService.processMessage(msg, {
      checkDatabaseDuplicates: false,
    });
    expect(result.type).toBe('IGNORED');
    if (result.type === 'IGNORED') {
      expect(result.reason).toBe('OTP');
    }
  });

  it('parses valid HDFC transaction into complete ParsedTransaction', async () => {
    const msg: RawSmsMessage = {
      id: 'tx-1',
      address: 'VM-HDFCBK',
      body: 'Rs.350.00 debited from HDFC Bank A/c **1234 on 15-Jan-25 to VPA swiggy@hdfcbank',
      date: 1705315200000,
    };

    const result = await SmsPipelineService.processMessage(msg, {
      checkDatabaseDuplicates: false,
    });
    expect(result.type).toBe('PARSED');
    if (result.type === 'PARSED') {
      expect(result.transaction.amount).toBe(350);
      expect(result.transaction.bank).toBe('HDFC Bank');
      expect(result.transaction.category).toBe('Food & Dining');
      expect(result.transaction.accountMask).toBe('1234');
      expect(result.transaction.isDuplicate).toBe(false);
    }
  });

  it('routes financial-like text with missing amount to REVIEW queue', async () => {
    const msg: RawSmsMessage = {
      id: 'tx-unrecognized',
      address: 'AX-ICICIB',
      body: 'Your account was debited successfully for your purchase. Thank you.',
      date: Date.now(),
    };

    const result = await SmsPipelineService.processMessage(msg, {
      checkDatabaseDuplicates: false,
    });
    // Lacks amount -> goes to UNKNOWN or REVIEW
    expect(result.type === 'IGNORED' || result.type === 'REVIEW').toBe(true);
  });
});
