import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAllBills,
  getUpcomingBills,
  getPaidBills,
  getMonthlyBillSummary,
  insertBill,
  updateBill,
  deleteBill,
  markBillAsPaid,
  dismissBill,
} from '@/services/database/bill-dao';
import type { BillReminder, BillStatus } from '@/types';

export function useBills() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('billsUpdated', () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    });
    return () => sub.remove();
  }, [queryClient]);

  return useQuery({
    queryKey: ['bills', 'all'],
    queryFn: () => getAllBills(),
  });
}

export function useUpcomingBills(daysAhead: number = 30) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('billsUpdated', () => {
      queryClient.invalidateQueries({ queryKey: ['bills', 'upcoming'] });
    });
    return () => sub.remove();
  }, [queryClient]);

  return useQuery({
    queryKey: ['bills', 'upcoming', daysAhead],
    queryFn: () => getUpcomingBills(daysAhead),
  });
}

export function usePaidBills(limit: number = 50) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('billsUpdated', () => {
      queryClient.invalidateQueries({ queryKey: ['bills', 'paid'] });
    });
    return () => sub.remove();
  }, [queryClient]);

  return useQuery({
    queryKey: ['bills', 'paid', limit],
    queryFn: () => getPaidBills(limit),
  });
}

export function useMonthlyBillSummary(month: number, year: number) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('billsUpdated', () => {
      queryClient.invalidateQueries({ queryKey: ['bills', 'summary', month, year] });
    });
    return () => sub.remove();
  }, [queryClient, month, year]);

  return useQuery({
    queryKey: ['bills', 'summary', month, year],
    queryFn: () => getMonthlyBillSummary(month, year),
  });
}

export function useCreateBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      data: Omit<BillReminder, 'id' | 'createdAt' | 'status'> & {
        id?: string;
        status?: BillStatus;
      }
    ) => insertBill(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });
}

export function useUpdateBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<BillReminder, 'id' | 'createdAt'>>;
    }) => updateBill(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });
}

export function useDeleteBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });
}

export function useMarkBillAsPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      paidDate,
      paidTransactionId,
    }: {
      id: string;
      paidDate?: string;
      paidTransactionId?: string;
    }) => markBillAsPaid(id, paidDate, paidTransactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });
}

export function useDismissBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => dismissBill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });
}
