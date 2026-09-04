import type { ExtractedTransaction, SmsClassification } from '@/modules/sms/types';

export interface CategoryRule {
  pattern: RegExp | string;
  category: string;
}

export class LocalCategorizerEngine {
  // Built-in merchant mapping dictionary
  private static readonly FOOD_MERCHANTS = [
    'swiggy',
    'zomato',
    'mcdonald',
    'starbucks',
    'domino',
    'kfc',
    'pizza hut',
    'burger king',
    'subway',
    'barbeque nation',
    'chai point',
    'chaayos',
    'faasos',
    'behrouz',
    'eatclub',
    'cafe coffee day',
    'ccd',
    'haldiram',
    'bikanervala',
  ];

  private static readonly GROCERY_MERCHANTS = [
    'blinkit',
    'zepto',
    'bigbasket',
    'bbinstant',
    'instamart',
    'dunzo',
    'dmart',
    'nature basket',
    'reliance fresh',
    'reliance smart',
    'spencer',
    'more retail',
    'jiomart',
  ];

  private static readonly SHOPPING_MERCHANTS = [
    'amazon',
    'flipkart',
    'myntra',
    'ajio',
    'nykaa',
    'meesho',
    'tata cliq',
    'croma',
    'reliance digital',
    'vijay sales',
    'ikea',
    'decathlon',
    'zara',
    'h&m',
    'hnm',
    'uniqlo',
    'westside',
    'pantaloons',
    'lifestyle',
    'shoppers stop',
  ];

  private static readonly TRANSPORT_MERCHANTS = [
    'uber',
    'ola',
    'rapido',
    'indianoil',
    'ioc',
    'hpcl',
    'bpcl',
    'shell petrol',
    'irctc',
    'makemytrip',
    'goibibo',
    'cleartrip',
    'yatra',
    'indigo',
    'air india',
    'spicejet',
    'metro',
    'fastag',
    'toll',
    'park+',
  ];

  private static readonly SUBSCRIPTION_MERCHANTS = [
    'netflix',
    'spotify',
    'amazon prime',
    'prime video',
    'hotstar',
    'disney',
    'youtube',
    'apple.com',
    'itunes',
    'google play',
    'sonyliv',
    'zee5',
    'jiosaavn',
    'gaana',
    'audible',
    'medium',
    'patreon',
    'chatgpt',
    'openai',
  ];

  private static readonly UTILITY_MERCHANTS = [
    'bescom',
    'tata power',
    'adani electricity',
    'bses',
    'mahadiscom',
    'airtel',
    'jio',
    'vodafone',
    'vi',
    'act fibernet',
    'hathway',
    'tatasky',
    'tata play',
    'dish tv',
    'indraprastha gas',
    'mahanagar gas',
    'igl',
    'mgl',
    'electricity',
    'water board',
  ];

  private static readonly HEALTH_MERCHANTS = [
    'apollo',
    'pharmeasy',
    '1mg',
    'tata 1mg',
    'netmeds',
    'medplus',
    'cult.fit',
    'cultfit',
    'curefit',
    'fortis',
    'max healthcare',
    'manipal hospital',
    'practo',
  ];

  private static readonly INVESTMENT_MERCHANTS = [
    'zerodha',
    'groww',
    'upstox',
    'angel one',
    'angel broking',
    'kuvera',
    'coin',
    'etmoney',
    'smallcase',
    'indmoney',
    'nippon',
    'hdfc mf',
    'sbi mutual fund',
    'uti mf',
    'icici pru',
  ];

  private static readonly HOUSING_MERCHANTS = [
    'nobroker',
    'housing.com',
    'cred rent',
    'rent',
    'society maintenance',
    'mygate',
  ];

  // User-defined custom rules
  private static customRules: CategoryRule[] = [];

  /**
   * Add a custom rule to the categorizer.
   */
  public static addCustomRule(pattern: RegExp | string, category: string): void {
    this.customRules.unshift({ pattern, category });
  }

  /**
   * Clear custom rules.
   */
  public static clearCustomRules(): void {
    this.customRules = [];
  }

  /**
   * Determine transaction category based on merchant name and transaction metadata.
   */
  public static categorize(
    transaction: Pick<ExtractedTransaction, 'merchant' | 'type'>,
    classification?: SmsClassification
  ): string {
    const merchantLower = transaction.merchant.toLowerCase();

    // 1. Check custom user rules first
    for (const rule of this.customRules) {
      if (typeof rule.pattern === 'string') {
        if (merchantLower.includes(rule.pattern.toLowerCase())) {
          return rule.category;
        }
      } else if (rule.pattern.test(merchantLower)) {
        return rule.category;
      }
    }

    // 2. Classification-driven categorization
    if (classification === 'SALARY_CREDIT' || merchantLower.includes('salary')) {
      return 'Salary';
    }
    if (classification === 'ATM_WITHDRAWAL' || merchantLower.includes('atm')) {
      return 'Cash & ATM';
    }
    if (classification === 'EMI' || merchantLower.includes('loan')) {
      return 'Loans & EMI';
    }

    // 3. Dictionary matching against merchant string
    if (this.FOOD_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Food & Dining';
    }

    if (this.GROCERY_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Groceries';
    }

    if (this.SUBSCRIPTION_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Subscriptions';
    }

    if (this.TRANSPORT_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Transportation';
    }

    if (this.SHOPPING_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Shopping';
    }

    if (this.UTILITY_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Bills & Utilities';
    }

    if (this.HEALTH_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Health & Fitness';
    }

    if (this.INVESTMENT_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Investments';
    }

    if (this.HOUSING_MERCHANTS.some((m) => merchantLower.includes(m))) {
      return 'Rent & Housing';
    }

    // 4. Secondary classification fallback
    if (classification === 'BILL') {
      return 'Bills & Utilities';
    }
    if (classification === 'SUBSCRIPTION') {
      return 'Subscriptions';
    }

    // 5. Default by direction
    return transaction.type === 'CREDIT' ? 'Income' : 'General';
  }
}
