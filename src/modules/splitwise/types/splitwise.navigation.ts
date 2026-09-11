/**
 * ============================================================================
 * Splitwise Module - Navigation Types
 * ============================================================================
 */

import type { DebtType } from './splitwise.types';

/**
 * Type-safe parameter definitions for Splitwise screens
 */
export interface SplitwisePersonDetailsParams {
  personId: string;
}

export interface AddSplitwiseDebtParams {
  personId?: string;
  type?: DebtType;
  amount?: string;
  description?: string;
}

export interface AddSplitwiseSettlementParams {
  personId?: string;
  amount?: string;
  description?: string;
}

/**
 * Route parameter map for Splitwise module routes in Expo Router
 */
export type SplitwiseRoutes = {
  '/splitwise': undefined;
  '/(app)/splitwise': undefined;
  '/splitwise-people': undefined;
  '/(app)/splitwise-people': undefined;
  '/splitwise-person-details': SplitwisePersonDetailsParams;
  '/(app)/splitwise-person-details': SplitwisePersonDetailsParams;
  '/add-splitwise-person': undefined;
  '/(app)/add-splitwise-person': undefined;
  '/add-splitwise-debt': AddSplitwiseDebtParams;
  '/(app)/add-splitwise-debt': AddSplitwiseDebtParams;
  '/add-splitwise-settlement': AddSplitwiseSettlementParams;
  '/(app)/add-splitwise-settlement': AddSplitwiseSettlementParams;
};

/**
 * Navigation screen descriptors
 */
export interface SplitwiseScreenDescriptor {
  name: string;
  title: string;
  route: string;
  icon: string;
  description: string;
  isModal?: boolean;
}

export const SPLITWISE_SCREENS: Record<string, SplitwiseScreenDescriptor> = {
  HOME: {
    name: 'splitwise',
    title: 'Splitwise',
    route: '/(app)/splitwise',
    icon: 'group',
    description: 'Shared expenses & balance overview',
  },
  PEOPLE: {
    name: 'splitwise-people',
    title: 'Friends Directory',
    route: '/(app)/splitwise-people',
    icon: 'people',
    description: 'All friends with individual balance status',
  },
  PERSON_DETAILS: {
    name: 'splitwise-person-details',
    title: 'Friend Details',
    route: '/(app)/splitwise-person-details',
    icon: 'person',
    description: 'Detailed debt and settlement history for a friend',
  },
  ADD_PERSON: {
    name: 'add-splitwise-person',
    title: 'Add Friend',
    route: '/(app)/add-splitwise-person',
    icon: 'person-add',
    description: 'Create a new friend or contact',
    isModal: true,
  },
  ADD_DEBT: {
    name: 'add-splitwise-debt',
    title: 'Add Debt',
    route: '/(app)/add-splitwise-debt',
    icon: 'receipt-long',
    description: 'Record a debt (receivable or payable)',
    isModal: true,
  },
  ADD_SETTLEMENT: {
    name: 'add-splitwise-settlement',
    title: 'Record Settlement',
    route: '/(app)/add-splitwise-settlement',
    icon: 'handshake',
    description: 'Record a settlement payment to balance accounts',
    isModal: true,
  },
};
