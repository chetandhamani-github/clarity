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

  // Semantic keyword clusters for zero-shot on-device merchant intelligence
  private static readonly SEMANTIC_CLUSTERS: Record<string, string[]> = {
    'Food & Dining': [
      'cafe', 'coffee', 'tea', 'chai', 'hotel', 'restaurant', 'restro', 'bites', 'kitchen',
      'dhaba', 'sagar', 'bhavan', 'bakery', 'sweets', 'snack', 'fast food', 'pizzeria',
      'burger', 'pizza', 'diner', 'eats', 'dining', 'pub', 'bar', 'brewery', 'tiffin', 'biryani',
    ],
    'Groceries': [
      'kirana', 'mart', 'bazaar', 'supermarket', 'hypermarket', 'provisions', 'dairy',
      'vegetable', 'fruits', 'organics', 'grocer', 'store', 'dryfruits',
    ],
    'Health & Fitness': [
      'medical', 'medicals', 'pharmacy', 'pharma', 'druggist', 'clinic', 'hospital',
      'healthcare', 'diagnostic', 'pathology', 'lab', 'dental', 'gym', 'fitness',
      'crossfit', 'yoga', 'wellness', 'spa', 'salon', 'barber',
    ],
    'Transportation': [
      'fuel', 'petrol', 'diesel', 'cng', 'hpcl', 'bpcl', 'ioc', 'indian oil', 'shell',
      'auto', 'cabs', 'taxi', 'ride', 'metro', 'railway', 'irctc', 'toll', 'fastag',
      'parking', 'flight', 'airways', 'airline', 'transit',
    ],
    'Shopping': [
      'retail', 'fashions', 'fashion', 'clothing', 'garments', 'textiles', 'silks',
      'footwear', 'shoes', 'opticals', 'eyewear', 'jewellers', 'jewellery', 'jewel',
      'electronics', 'appliances', 'furniture', 'stationery', 'gift', 'toys', 'books',
    ],
    'Entertainment': [
      'cinema', 'cinemas', 'theatre', 'theater', 'movie', 'multiplex', 'gaming',
      'amusement', 'resort', 'club', 'concert', 'events', 'ott',
    ],
    'Bills & Utilities': [
      'electricity', 'power', 'bescom', 'energy', 'water', 'gas', 'broadband',
      'internet', 'wifi', 'fiber', 'telecom', 'recharge', 'dth', 'cable',
    ],
    'Investments': [
      'mutual fund', 'stocks', 'securities', 'invest', 'wealth', 'gold', 'bullion',
      'capital', 'brokerage',
    ],
    'Rent & Housing': [
      'maintenance', 'society', 'apartment', 'realty', 'builders', 'housing', 'flat', 'property',
    ],
    'Education': [
      'school', 'college', 'university', 'academy', 'classes', 'tuition', 'coaching',
      'learning', 'course',
    ],
  };

  // User-defined custom rules
  private static customRules: CategoryRule[] = [];

  /**
   * Load persistent merchant rules from SQLite into memory for fast lookup.
   */
  public static async loadDatabaseRules(): Promise<void> {
    try {
      const { getAllMerchantRules } = await import('@/services/database/merchant-rule-dao');
      const dbRules = await getAllMerchantRules();
      for (const rule of dbRules) {
        this.addCustomRule(rule.merchantPattern, rule.category);
      }
    } catch {
      // Database not ready or in test environment
    }
  }

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

    // 4. Semantic token clustering analysis for unlisted/local vendors
    const normalizedTokens = merchantLower
      .replace(/[._\-/*@#:]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    for (const [category, keywords] of Object.entries(this.SEMANTIC_CLUSTERS)) {
      if (
        keywords.some((kw) =>
          kw.includes(' ')
            ? merchantLower.includes(kw)
            : normalizedTokens.includes(kw) || merchantLower.includes(kw)
        )
      ) {
        return category;
      }
    }

    // 5. Secondary classification fallback
    if (classification === 'BILL') {
      return 'Bills & Utilities';
    }
    if (classification === 'SUBSCRIPTION') {
      return 'Subscriptions';
    }

    // 6. Default by direction
    return transaction.type === 'CREDIT' ? 'Income' : 'General';
  }
}
