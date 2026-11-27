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

  it('correctly distinguishes account names from generic keywords like salary and bank', async () => {
    // "salary" keyword should not falsely trigger "ICICI Salary" when SBI is specified
    const incomeResult = await parseVoiceTranscript('Salary 50000 into SBI', accounts);
    expect(incomeResult.amount).toBe(50000);
    expect(incomeResult.type).toBe('income');
    expect(incomeResult.accountId).toBe('acc-2');

    // "bank" keyword should not falsely trigger "HDFC Bank" when SBI is specified
    const expenseResult = await parseVoiceTranscript('Paid 200 at Starbucks using SBI bank card', accounts);
    expect(expenseResult.amount).toBe(200);
    expect(expenseResult.accountId).toBe('acc-2');

    const depositResult = await parseVoiceTranscript('Received 5000 from client into HDFC', accounts);
    expect(depositResult.amount).toBe(5000);
    expect(depositResult.accountId).toBe('acc-1');

    // Explicit "income" keyword
    const freelanceResult = await parseVoiceTranscript('Income 25000 from client in SBI', accounts);
    expect(freelanceResult.amount).toBe(25000);
    expect(freelanceResult.type).toBe('income');
    expect(freelanceResult.accountId).toBe('acc-2');

    // Hinglish "HDFC se" postposition
    const hinglishResult = await parseVoiceTranscript('Paid 400 for dinner HDFC se', accounts);
    expect(hinglishResult.amount).toBe(400);
    expect(hinglishResult.accountId).toBe('acc-1');
  });

  it('matches accounts using last four digits when provided', async () => {
    const cardAccounts = [
      { id: 'card-1', name: 'HDFC Bank', lastFour: '1122' },
      { id: 'card-2', name: 'HDFC Bank', lastFour: '4455' },
    ];
    const res = await parseVoiceTranscript('Paid 900 for groceries with card 4455', cardAccounts);
    expect(res.amount).toBe(900);
    expect(res.accountId).toBe('card-2');

    const cardFirst = await parseVoiceTranscript('HDFC 4242 paid 500 for dinner', cardAccounts);
    expect(cardFirst.amount).toBe(500);
  });

  it('handles empty input gracefully', async () => {
    const result = await parseVoiceTranscript('');
    expect(result.amount).toBe(0);
    expect(result.merchant).toBe('');
    expect(result.confidence).toBe(0);
  });
});
