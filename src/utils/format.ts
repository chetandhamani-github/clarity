import { useAppStore } from '@/store/use-app-store';

export function formatCurrency(amount: number, compact: boolean = false): string {
  const currency = useAppStore.getState().currency || 'INR';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';

  if (compact) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(amount);
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyWhole(amount: number): string {
  const currency = useAppStore.getState().currency || 'INR';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyPrivacy(
  amount: number,
  compact: boolean = false,
  hideOverride?: boolean
): string {
  const hideBalances =
    hideOverride !== undefined ? hideOverride : useAppStore.getState().hideBalances;
  if (hideBalances) return '••••••';
  return formatCurrency(amount, compact);
}

export function formatCurrencyWholePrivacy(amount: number, hideOverride?: boolean): string {
  const hideBalances =
    hideOverride !== undefined ? hideOverride : useAppStore.getState().hideBalances;
  if (hideBalances) return '••••••';
  return formatCurrencyWhole(amount);
}

export function getCurrencySymbol(): string {
  const currency = useAppStore.getState().currency || 'INR';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value || '$';
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(
  dateString: string,
  style: 'short' | 'full' | 'month-day' | 'month-year' = 'short'
): string {
  const date = new Date(dateString);

  switch (style) {
    case 'full':
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    case 'month-day':
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    case 'month-year':
      return date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    case 'short':
    default:
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  }
}

export function formatDateGroup(dateString: string): string {
  return new Date(dateString)
    .toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
}

export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(dateString, 'month-day');
}

export function getTransactionSign(type: 'expense' | 'income' | 'transfer'): string {
  switch (type) {
    case 'expense':
      return '-';
    case 'income':
      return '+';
    case 'transfer':
      return '';
  }
}

export function groupTransactionsByDate<T extends { date: string }>(
  transactions: T[]
): { date: string; label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();

  for (const tx of transactions) {
    const dateKey = tx.date.split('T')[0];
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(tx);
    } else {
      groups.set(dateKey, [tx]);
    }
  }

  return Array.from(groups.entries()).map(([dateKey, items]) => ({
    date: dateKey,
    label: formatDateGroup(dateKey),
    items,
  }));
}
