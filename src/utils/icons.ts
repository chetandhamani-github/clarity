import type { MaterialIcons } from '@expo/vector-icons';

type IconName = keyof typeof MaterialIcons.glyphMap;

const CATEGORY_ICON_MAP: Record<string, IconName> = {
  groceries: 'shopping-cart',
  grocery: 'shopping-cart',
  rent: 'home',
  housing: 'home',
  mortgage: 'home',
  utilities: 'flash-on',
  electricity: 'flash-on',
  bills: 'receipt',
  transport: 'directions-car',
  fuel: 'local-gas-station',
  petrol: 'local-gas-station',
  diesel: 'local-gas-station',
  gas: 'local-gas-station',
  health: 'favorite',
  medical: 'medical-services',
  insurance: 'shield',
  dining: 'restaurant',
  food: 'restaurant',
  swiggy: 'delivery-dining',
  zomato: 'delivery-dining',
  entertainment: 'movie',
  movies: 'movie',
  shopping: 'local-mall',
  subscriptions: 'subscriptions',
  ott: 'subscriptions',
  travel: 'flight',
  outings: 'flight',
  education: 'school',
  salary: 'work',
  income: 'payments',
  freelance: 'laptop',
  transfer: 'swap-horiz',
  investments: 'trending-up',
  'mutual funds': 'trending-up',
  sip: 'trending-up',
  savings: 'savings',
  'emergency fund': 'security',
  gifts: 'card-giftcard',
  personal: 'person',
  pets: 'pets',
  fitness: 'fitness-center',
  upi: 'qr-code-scanner',
};

export function getCategoryIcon(category?: string): IconName {
  if (!category) return 'category';
  const key = category.toLowerCase().trim();
  for (const [mapKey, icon] of Object.entries(CATEGORY_ICON_MAP)) {
    if (key.includes(mapKey)) return icon;
  }
  return CATEGORY_ICON_MAP[key] ?? 'category';
}

const ACCOUNT_TYPE_ICON_MAP: Record<string, IconName> = {
  savings: 'savings',
  current: 'account-balance',
  checking: 'account-balance',
  credit: 'credit-card',
  loan: 'handshake',
  investment: 'show-chart',
  wallet: 'account-balance-wallet',
  other: 'account-balance',
};

export function getAccountTypeIcon(accountType: string): IconName {
  return ACCOUNT_TYPE_ICON_MAP[accountType] ?? 'account-balance';
}
