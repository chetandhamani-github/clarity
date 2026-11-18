import { parseVoiceTranscript } from './voice-parser';

jest.mock('@/services/api/ai.api', () => ({
  parseVoiceTransactionWithAi: jest.fn().mockRejectedValue(new Error('Network offline')),
}));

describe('voice-parser', () => {
  const accounts = [
    { id: 'acc-1', name: 'HDFC Bank' },
    { id: 'acc-2', name: 'SBI Savings' },
    { id: 'acc-3', name: 'ICICI Salary' },
  ];

  it('parses an expense locally with amount, merchant, and matched account', async () => {
    const result = await parseVoiceTranscript('Paid 350 for lunch at Subway with HDFC', accounts);
    expect(result.amount).toBe(350);
    expect(result.merchant.toLowerCase()).toContain('subway');
    expect(result.type).toBe('expense');
    expect(result.accountId).toBe('acc-1');
  });

  it('parses income transactions correctly', async () => {
    const result = await parseVoiceTranscript('Got 45000 salary credited to ICICI', accounts);
    expect(result.amount).toBe(45000);
    expect(result.type).toBe('income');
    expect(result.category).toBe('Salary');
    expect(result.accountId).toBe('acc-3');
  });

  it('handles rupee symbols and punctuation', async () => {
    const result = await parseVoiceTranscript('Petrol ₹1,500 using SBI card', accounts);
    expect(result.amount).toBe(1500);
    expect(result.merchant.toLowerCase()).toContain('petrol');
    expect(result.accountId).toBe('acc-2');

    const lakhs = await parseVoiceTranscript('Investment ₹1,50,000 via HDFC', accounts);
    expect(lakhs.amount).toBe(150000);
    expect(lakhs.accountId).toBe('acc-1');

    const decimal = await parseVoiceTranscript('Coffee 120.50 cash');
    expect(decimal.amount).toBe(120.5);
  });

  it('handles empty input gracefully', async () => {
    const result = await parseVoiceTranscript('');
    expect(result.amount).toBe(0);
    expect(result.merchant).toBe('');
    expect(result.confidence).toBe(0);
  });
});
