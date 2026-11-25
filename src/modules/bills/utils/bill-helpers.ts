import type { BillCategory } from '../types/bill.types';

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
