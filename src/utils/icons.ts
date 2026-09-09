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
  borrowed: 'handshake',
  lent: 'call-made',
  debt: 'handshake',
  investment: 'show-chart',
  wallet: 'account-balance-wallet',
  other: 'account-balance',
};

export function getAccountTypeIcon(accountType: string): IconName {
  return ACCOUNT_TYPE_ICON_MAP[accountType] ?? 'account-balance';
}

export interface BankBranding {
  name: string;
  shortName: string;
  color: string;
  backgroundColor: string;
  icon: IconName;
}

const BANK_BRANDING_MAP: Record<
  string,
  { shortName: string; color: string; backgroundColor: string; icon?: IconName }
> = {
  hdfc: { shortName: 'HDFC', color: '#004c8f', backgroundColor: 'rgba(0, 76, 143, 0.15)' },
  sbi: { shortName: 'SBI', color: '#1e88e5', backgroundColor: 'rgba(30, 136, 229, 0.15)' },
  'state bank': { shortName: 'SBI', color: '#1e88e5', backgroundColor: 'rgba(30, 136, 229, 0.15)' },
  icici: { shortName: 'ICICI', color: '#ea580c', backgroundColor: 'rgba(234, 88, 12, 0.15)' },
  axis: { shortName: 'AXIS', color: '#97144d', backgroundColor: 'rgba(151, 20, 77, 0.15)' },
  kotak: { shortName: 'KOTAK', color: '#e11d48', backgroundColor: 'rgba(225, 29, 72, 0.15)' },
  idfc: { shortName: 'IDFC', color: '#9e1b32', backgroundColor: 'rgba(158, 27, 50, 0.15)' },
  pnb: { shortName: 'PNB', color: '#be185d', backgroundColor: 'rgba(190, 24, 93, 0.15)' },
  punjab: { shortName: 'PNB', color: '#be185d', backgroundColor: 'rgba(190, 24, 93, 0.15)' },
  baroda: { shortName: 'BOB', color: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.15)' },
  bob: { shortName: 'BOB', color: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.15)' },
  canara: { shortName: 'CANARA', color: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.15)' },
  union: { shortName: 'UNION', color: '#0369a1', backgroundColor: 'rgba(3, 105, 161, 0.15)' },
  yes: { shortName: 'YES', color: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.15)' },
  indusind: { shortName: 'INDUS', color: '#881337', backgroundColor: 'rgba(136, 19, 55, 0.15)' },
  federal: { shortName: 'FEDERAL', color: '#1d4ed8', backgroundColor: 'rgba(29, 78, 216, 0.15)' },
  au: { shortName: 'AU', color: '#7c3aed', backgroundColor: 'rgba(124, 58, 237, 0.15)' },
  rbl: { shortName: 'RBL', color: '#1e40af', backgroundColor: 'rgba(30, 64, 175, 0.15)' },
  paytm: { shortName: 'PAYTM', color: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.15)' },
  airtel: { shortName: 'AIRTEL', color: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.15)' },
  citi: { shortName: 'CITI', color: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.15)' },
  standard: { shortName: 'SCB', color: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.15)' },
  hsbc: { shortName: 'HSBC', color: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.15)' },
  dbs: { shortName: 'DBS', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)' },
};

export function getBankBranding(bankOrInstitution?: string): BankBranding {
  if (!bankOrInstitution || bankOrInstitution.trim() === '') {
    return {
      name: 'Bank',
      shortName: 'BANK',
      color: '#4f46e5',
      backgroundColor: 'rgba(79, 70, 229, 0.15)',
      icon: 'account-balance',
    };
  }

  const lower = bankOrInstitution.toLowerCase().trim();
  for (const [key, brand] of Object.entries(BANK_BRANDING_MAP)) {
    if (lower.includes(key)) {
      return {
        name: bankOrInstitution,
        shortName: brand.shortName,
        color: brand.color,
        backgroundColor: brand.backgroundColor,
        icon: brand.icon ?? 'account-balance',
      };
    }
  }

  const shortName = bankOrInstitution.split(' ')[0]?.slice(0, 6).toUpperCase() || 'BANK';
  return {
    name: bankOrInstitution,
    shortName,
    color: '#0284c7',
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    icon: 'account-balance',
  };
}
