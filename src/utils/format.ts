import { useAppStore } from '@/store/use-app-store';

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

function getNumberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = numberFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, formatter);
  }
  return formatter;
}

function getDateTimeFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = dateTimeFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatCache.set(key, formatter);
  }
  return formatter;
}

export function formatCurrency(amount: number, compact: boolean = false): string {
  const currency = useAppStore.getState().currency || 'INR';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';

  if (compact) {
    return getNumberFormatter(locale, {
      style: 'currency',
      currency: currency,
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(amount);
  }

  return getNumberFormatter(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyWhole(amount: number): string {
  const currency = useAppStore.getState().currency || 'INR';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return getNumberFormatter(locale, {
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
  const parts = getNumberFormatter(locale, {
    style: 'currency',
    currency: currency,
  }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value || '$';
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatLocalDate(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateSafely(dateInput: string | Date | number | null | undefined): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'number') return new Date(dateInput);

  const str = String(dateInput).trim();
  if (!str) return new Date();

  // Pure digits: timestamp in milliseconds
  if (/^\d+$/.test(str)) {
    return new Date(Number(str));
  }

  // Plain calendar date "YYYY-MM-DD" -> parse in local timezone
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // SQLite datetime format "YYYY-MM-DD HH:MM:SS" (stored in UTC)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
    return new Date(str.replace(' ', 'T') + 'Z');
  }

  // ISO string with time but NO timezone indicator "YYYY-MM-DDTHH:MM:SS..." (UTC)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(str)) {
    return new Date(str + 'Z');
  }

  return new Date(str);
}

export function formatDate(
  dateString: string,
  style: 'short' | 'full' | 'month-day' | 'month-year' = 'short'
): string {
  const date = parseDateSafely(dateString);

  switch (style) {
    case 'full':
      return getDateTimeFormatter('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    case 'month-day':
      return getDateTimeFormatter('en-US', {
        month: 'short',
        day: 'numeric',
      }).format(date);
    case 'month-year':
      return getDateTimeFormatter('en-US', {
        month: 'long',
        year: 'numeric',
      }).format(date);
    case 'short':
    default:
      return getDateTimeFormatter('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
  }
}

export function formatDateGroup(dateString: string): string {
  return getDateTimeFormatter('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
    .format(parseDateSafely(dateString))
    .toUpperCase();
}

export function formatTime(dateString: string): string {
  return getDateTimeFormatter('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parseDateSafely(dateString));
}

export function formatNotificationTime(dateString: string): string {
  const date = parseDateSafely(dateString);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = getDateTimeFormatter('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  if (isToday) {
    return timeStr;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  const dateStr = getDateTimeFormatter('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);

  return `${dateStr}, ${timeStr}`;
}

export function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = parseDateSafely(dateString);
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

export function formatTransactionTime(
  dateString?: string,
  createdAtString?: string
): string | null {
  if (dateString) {
    const hasTime =
      dateString.includes('T') ||
      /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(dateString) ||
      /^\d{10,}$/.test(dateString.trim());
    if (hasTime) {
      return formatTime(dateString);
    }
  }

  if (createdAtString) {
    const hasTime =
      createdAtString.includes('T') ||
      /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(createdAtString) ||
      /^\d{10,}$/.test(createdAtString.trim());
    if (hasTime) {
      return formatTime(createdAtString);
    }
  }

  return null;
}

export function groupTransactionsByDate<T extends { date: string; createdAt?: string }>(
  transactions: T[]
): { date: string; label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();

  for (const tx of transactions) {
    if (!tx || !tx.date) continue;
    const dateKey = tx.date.includes('T')
      ? formatLocalDate(parseDateSafely(tx.date))
      : tx.date.trim();
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(tx);
    } else {
      groups.set(dateKey, [tx]);
    }
  }

  const getEffectiveTimeMs = (tx: T): number | null => {
    if (!tx || !tx.date) return null;
    const hasTime =
      tx.date.includes('T') ||
      /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(tx.date) ||
      /^\d{10,}$/.test(tx.date.trim());
    if (hasTime) {
      const t = parseDateSafely(tx.date).getTime();
      if (!isNaN(t)) return t;
    }
    if (tx.createdAt) {
      const t = parseDateSafely(tx.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    return null;
  };

  return Array.from(groups.entries()).map(([dateKey, items]) => {
    const sorted = [...items].sort((a, b) => {
      const timeA = getEffectiveTimeMs(a);
      const timeB = getEffectiveTimeMs(b);

      if (timeA !== null && timeB !== null && timeA !== timeB) {
        return timeB - timeA;
      }
      if (timeA !== null && timeB === null) {
        return -1;
      }
      if (timeA === null && timeB !== null) {
        return 1;
      }
      return 0;
    });

    return {
      date: dateKey,
      label: formatDateGroup(dateKey),
      items: sorted,
    };
  });
}
