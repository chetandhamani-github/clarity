import type { TransactionWithAccount } from '@/types';

const GENERIC_SMS_MERCHANT = /^(?:.+\s+)?(?:bank\s+)?transaction$/i;
const OPAQUE_GATEWAY_MERCHANT =
  /^(?:vyapar|bharatpe|paytmqr|phonepeqr|pinelabs|razorpay|cashfree|billdesk|easebuzz|ccavenue|mswipe|q\d{4,}|\d{5,})$/i;

export function hasMeaningfulMerchant(transaction: Pick<TransactionWithAccount, 'merchant' | 'category'>): boolean {
  const merchant = transaction.merchant?.trim();
  if (!merchant || GENERIC_SMS_MERCHANT.test(merchant) || OPAQUE_GATEWAY_MERCHANT.test(merchant)) {
    return false;
  }

  return merchant.toLowerCase() !== transaction.category.trim().toLowerCase();
}

export function getTransactionDisplayName(
  transaction: Pick<TransactionWithAccount, 'type' | 'merchant' | 'category'>
): string {
  if (transaction.type === 'transfer') {
    const trimmed = transaction.merchant?.trim();
    if (trimmed && trimmed.toLowerCase() !== 'transfer' && !GENERIC_SMS_MERCHANT.test(trimmed)) {
      return trimmed;
    }
    return 'Transfer';
  }

  return hasMeaningfulMerchant(transaction) ? transaction.merchant.trim() : transaction.category;
}
