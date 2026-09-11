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

export interface BillerBranding {
  name: string;
  category: string;
  color: string;
  backgroundColor: string;
  icon: IconName;
}

const BILLER_ICON_MAP: Record<string, { icon: IconName; color: string; bg: string }> = {
  credit_card: { icon: 'credit-card', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' },
  electricity: { icon: 'flash-on', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  broadband: { icon: 'wifi', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
  mobile_postpaid: { icon: 'smartphone', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  gas: { icon: 'local-gas-station', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.15)' },
  water: { icon: 'water-drop', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.15)' },
  loan_emi: { icon: 'account-balance', color: '#9333ea', bg: 'rgba(147, 51, 234, 0.15)' },
  dth: { icon: 'tv', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
  insurance: { icon: 'shield', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  rent: { icon: 'home', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  staff: { icon: 'people', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)' },
  gym: { icon: 'fitness-center', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  tuition: { icon: 'school', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  maintenance: { icon: 'apartment', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' },
  other: { icon: 'receipt', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
};

export function getBillerIcon(category?: string): IconName {
  if (!category) return 'receipt';
  return BILLER_ICON_MAP[category.toLowerCase().trim()]?.icon ?? 'receipt';
}

export function getBillerBranding(billerName: string, category?: string): BillerBranding {
  const catKey = category?.toLowerCase().trim() || 'other';
  const defaultBranding = BILLER_ICON_MAP[catKey] || BILLER_ICON_MAP.other;

  const lowerName = billerName.toLowerCase().trim();

  // Specific brand custom colors
  if (lowerName.includes('airtel')) {
    return { name: billerName, category: catKey, color: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.15)', icon: 'wifi' };
  }
  if (lowerName.includes('jio')) {
    return { name: billerName, category: catKey, color: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.15)', icon: 'wifi' };
  }
  if (lowerName.includes('bescom') || lowerName.includes('tata power') || lowerName.includes('electricity')) {
    return { name: billerName, category: 'electricity', color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.15)', icon: 'flash-on' };
  }
  if (lowerName.includes('igl') || lowerName.includes('mgl') || lowerName.includes('gas')) {
    return { name: billerName, category: 'gas', color: '#ea580c', backgroundColor: 'rgba(234, 88, 12, 0.15)', icon: 'local-gas-station' };
  }
  if (lowerName.includes('rent') || lowerName.includes('house rent')) {
    return { name: billerName, category: 'rent', color: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.15)', icon: 'home' };
  }
  if (lowerName.includes('tata play') || lowerName.includes('dth') || lowerName.includes('dish')) {
    return { name: billerName, category: 'dth', color: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.15)', icon: 'tv' };
  }
  if (lowerName.includes('cult') || lowerName.includes('gym')) {
    return { name: billerName, category: 'gym', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', icon: 'fitness-center' };
  }
  if (lowerName.includes('hdfc') || lowerName.includes('sbi') || lowerName.includes('icici') || lowerName.includes('axis') || lowerName.includes('credit card')) {
    const bank = getBankBranding(billerName);
    return { name: billerName, category: 'credit_card', color: bank.color, backgroundColor: bank.backgroundColor, icon: 'credit-card' };
  }

  return {
    name: billerName,
    category: catKey,
    color: defaultBranding.color,
    backgroundColor: defaultBranding.bg,
    icon: defaultBranding.icon,
  };
}

