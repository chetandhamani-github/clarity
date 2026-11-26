import type { BillCategory, BillSource } from '../types/bill.types';

const EXTERNAL_BILLER_CATEGORY_MAP: Record<string, BillCategory> = {
  electricity: 'electricity',
  water: 'water',
  broadband: 'internet',
  landline: 'internet',
  mobile_postpaid: 'mobile',
  credit_card: 'credit_card',
  loan_emi: 'emi',
  insurance: 'insurance',
  rent: 'rent',
  housing_society: 'rent',
  maintenance: 'rent',
  subscription: 'subscription',
  dth: 'subscription',
  cable_tv: 'subscription',
  tuition: 'education',
  gas: 'other',
  piped_gas: 'other',
  lpg_cylinder: 'other',
};

/**
 * Maps an SMS/notification extracted biller category to the modern BillCategory union.
 */
export function mapExternalBillerCategory(billerCategory: string): BillCategory {
  return EXTERNAL_BILLER_CATEGORY_MAP[billerCategory] ?? 'other';
}

const BILL_SOURCE_LABELS: Record<BillSource, string> = {
  manual: 'MANUAL',
  sms: 'AUTO',
  email: 'EMAIL',
  future_api: 'API',
};

/**
 * Formats an internal bill source into a user-facing UI badge/label.
 */
export function getBillSourceLabel(source: BillSource | string): string {
  return BILL_SOURCE_LABELS[source as BillSource] ?? String(source || 'manual').toUpperCase();
}
