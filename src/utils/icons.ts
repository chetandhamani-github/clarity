import type { MaterialIcons } from '@expo/vector-icons';

type IconName = keyof typeof MaterialIcons.glyphMap;

const CATEGORY_ICON_MAP: Record<string, IconName> = {
  groceries: 'shopping-cart',
  rent: 'home',
  mortgage: 'home',
  utilities: 'flash-on',
  transport: 'directions-car',
  gas: 'local-gas-station',
  health: 'favorite',
  insurance: 'shield',
  dining: 'restaurant',
  entertainment: 'movie',
  shopping: 'local-mall',
  subscriptions: 'subscriptions',
  travel: 'flight',
  education: 'school',
  salary: 'work',
  freelance: 'laptop',
  transfer: 'swap-horiz',
  investments: 'trending-up',
  savings: 'savings',
  gifts: 'card-giftcard',
  personal: 'person',
  pets: 'pets',
  fitness: 'fitness-center',
};

export function getCategoryIcon(category?: string): IconName {
  if (!category) return 'category';
  const key = category.toLowerCase().trim();
  return CATEGORY_ICON_MAP[key] ?? 'category';
}

const ACCOUNT_TYPE_ICON_MAP: Record<string, IconName> = {
  checking: 'account-balance',
  savings: 'savings',
  credit: 'credit-card',
  investment: 'show-chart',
};

export function getAccountTypeIcon(accountType: string): IconName {
  return ACCOUNT_TYPE_ICON_MAP[accountType] ?? 'account-balance';
}
