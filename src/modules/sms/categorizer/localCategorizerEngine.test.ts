import { LocalCategorizerEngine } from './localCategorizerEngine';

describe('LocalCategorizerEngine', () => {
  beforeEach(() => {
    LocalCategorizerEngine.clearCustomRules();
  });

  it('categorizes Swiggy and Zomato as Food & Dining', () => {
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Swiggy', type: 'DEBIT' })
    ).toBe('Food & Dining');
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Zomato', type: 'DEBIT' })
    ).toBe('Food & Dining');
  });

  it('categorizes Uber and Ola as Transportation', () => {
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Uber India', type: 'DEBIT' })
    ).toBe('Transportation');
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Ola Cabs', type: 'DEBIT' })
    ).toBe('Transportation');
  });

  it('categorizes Amazon and Flipkart as Shopping', () => {
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Amazon Pay', type: 'DEBIT' })
    ).toBe('Shopping');
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Flipkart Internet', type: 'DEBIT' })
    ).toBe('Shopping');
  });

  it('categorizes Netflix and Spotify as Subscriptions', () => {
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Netflix', type: 'DEBIT' })
    ).toBe('Subscriptions');
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Spotify AB', type: 'DEBIT' })
    ).toBe('Subscriptions');
  });

  it('categorizes Blinkit and Zepto as Groceries', () => {
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Blinkit Commerce', type: 'DEBIT' })
    ).toBe('Groceries');
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Zepto Quick', type: 'DEBIT' })
    ).toBe('Groceries');
  });

  it('categorizes BESCOM and Airtel as Bills & Utilities', () => {
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'BESCOM Power', type: 'DEBIT' })
    ).toBe('Bills & Utilities');
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Airtel Postpaid', type: 'DEBIT' })
    ).toBe('Bills & Utilities');
  });

  it('categorizes Zerodha and Groww as Investments', () => {
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Zerodha Broking', type: 'DEBIT' })
    ).toBe('Investments');
    expect(
      LocalCategorizerEngine.categorize({ merchant: 'Groww Invest', type: 'DEBIT' })
    ).toBe('Investments');
  });

  it('categorizes based on classification intent for Salary, ATM, EMI', () => {
    expect(
      LocalCategorizerEngine.categorize(
        { merchant: 'Infosys Ltd', type: 'CREDIT' },
        'SALARY_CREDIT'
      )
    ).toBe('Salary');

    expect(
      LocalCategorizerEngine.categorize(
        { merchant: 'Cash Withdrawal', type: 'DEBIT' },
        'ATM_WITHDRAWAL'
      )
    ).toBe('Cash & ATM');

    expect(
      LocalCategorizerEngine.categorize(
        { merchant: 'HDFC Bank Loan', type: 'DEBIT' },
        'EMI'
      )
    ).toBe('Loans & EMI');
  });

  it('prioritizes custom user rules over built-in dictionary', () => {
    LocalCategorizerEngine.addCustomRule('swiggy', 'Custom Personal Allowance');
    const result = LocalCategorizerEngine.categorize({ merchant: 'Swiggy', type: 'DEBIT' });
    expect(result).toBe('Custom Personal Allowance');
  });
});
