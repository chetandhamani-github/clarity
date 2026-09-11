import { useEffect, useMemo, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useBillsStore, BillsTab } from '../store/bills.store';
import type { Bill, Subscription } from '../types/bill.types';

export function useBills() {
  const {
    bills,
    subscriptions,
    summary,
    selectedTab,
    selectedCategory,
    searchQuery,
    isLoading,
    loadData,
    createBill,
    updateBill,
    deleteBill,
    markBillPaid,
    createSubscription,
    updateSubscription,
    deleteSubscription,
    setSelectedTab,
    setSelectedCategory,
    setSearchQuery,
  } = useBillsStore();

  useEffect(() => {
    loadData();

    const sub = DeviceEventEmitter.addListener('billsUpdated', () => {
      loadData();
    });

    return () => {
      sub.remove();
    };
  }, [loadData]);

  const upcomingBills = useMemo(
    () => bills.filter((b) => b.status === 'upcoming' || b.status === 'overdue'),
    [bills]
  );

  const overdueBills = useMemo(
    () => bills.filter((b) => b.status === 'overdue'),
    [bills]
  );

  const paidBills = useMemo(
    () => bills.filter((b) => b.status === 'paid'),
    [bills]
  );

  // Filter bills based on current active tab, selected category, and search query
  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      // 1. Tab filter
      if (selectedTab === 'upcoming') {
        if (bill.status !== 'upcoming') return false;
      } else if (selectedTab === 'overdue') {
        if (bill.status !== 'overdue') return false;
      } else if (selectedTab === 'paid') {
        if (bill.status !== 'paid') return false;
      }

      // 2. Category filter
      if (selectedCategory !== 'all' && bill.category !== selectedCategory) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = bill.title.toLowerCase().includes(q);
        const matchProvider = bill.provider?.toLowerCase().includes(q);
        const matchRef = bill.accountReference?.toLowerCase().includes(q);
        const matchNotes = bill.notes?.toLowerCase().includes(q);
        if (!matchTitle && !matchProvider && !matchRef && !matchNotes) {
          return false;
        }
      }

      return true;
    });
  }, [bills, selectedTab, selectedCategory, searchQuery]);

  // Filter subscriptions based on search query and category
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      if (selectedCategory !== 'all' && sub.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = sub.name.toLowerCase().includes(q);
        const matchProvider = sub.provider?.toLowerCase().includes(q);
        const matchNotes = sub.notes?.toLowerCase().includes(q);
        if (!matchName && !matchProvider && !matchNotes) {
          return false;
        }
      }
      return true;
    });
  }, [subscriptions, selectedCategory, searchQuery]);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  return {
    bills: filteredBills,
    allBills: bills,
    upcomingBills,
    overdueBills,
    paidBills,
    subscriptions: filteredSubscriptions,
    allSubscriptions: subscriptions,
    summary,
    selectedTab,
    selectedCategory,
    searchQuery,
    isLoading,
    refresh,
    createBill,
    updateBill,
    deleteBill,
    markBillPaid,
    createSubscription,
    updateSubscription,
    deleteSubscription,
    setSelectedTab,
    setSelectedCategory,
    setSearchQuery,
  };
}

export function useUpcomingBillsSummary() {
  const { summary, upcomingBills, isLoading, refresh } = useBills();
  return {
    upcomingCount: summary.upcomingCount,
    upcomingAmount: summary.upcomingAmount,
    overdueCount: summary.overdueCount,
    upcomingBills,
    isLoading,
    refresh,
  };
}
