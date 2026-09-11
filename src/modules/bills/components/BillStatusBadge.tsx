import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme, typography } from '@/theme';
import type { BillStatus } from '../types/bill.types';

interface BillStatusBadgeProps {
  status: BillStatus;
  dueDate: string;
  lastPaidDate?: string;
  size?: 'sm' | 'md';
}

export function BillStatusBadge({
  status,
  dueDate,
  lastPaidDate,
  size = 'md',
}: BillStatusBadgeProps) {
  const { colors } = useTheme();

  const now = new Date();
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let diffDays = 0;
  if (dueDate) {
    const parts = dueDate.split('T')[0].split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const dueTime = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
      diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));
    } else {
      const parsed = new Date(dueDate).getTime();
      if (!isNaN(parsed)) {
        diffDays = Math.round((parsed - todayTime) / (1000 * 60 * 60 * 24));
      }
    }
  }

  let text = `Due in ${diffDays}d`;
  let bgColor = colors.surfaceContainerHighest;
  let textColor = colors.onSurfaceVariant;

  if (status === 'paid') {
    text = lastPaidDate ? `Paid ${lastPaidDate}` : 'Paid';
    bgColor = 'rgba(16, 185, 129, 0.15)';
    textColor = '#10b981';
  } else if (status === 'overdue' || diffDays < 0) {
    text = diffDays < 0 ? `Overdue ${Math.abs(diffDays)}d` : 'Overdue';
    bgColor = 'rgba(239, 68, 68, 0.15)';
    textColor = '#ef4444';
  } else if (diffDays === 0) {
    text = 'Due Today';
    bgColor = 'rgba(245, 158, 11, 0.15)';
    textColor = '#f59e0b';
  } else if (diffDays === 1) {
    text = 'Due Tomorrow';
    bgColor = 'rgba(249, 115, 22, 0.15)';
    textColor = '#f97316';
  }

  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.badgeSm : styles.badgeMd,
        { backgroundColor: bgColor },
      ]}
    >
      <Text
        variant="labelMd"
        style={[
          styles.text,
          isSmall ? styles.textSm : styles.textMd,
          { color: textColor },
        ]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeMd: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    ...typography.labelMd,
    fontWeight: '700',
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  textSm: {
    fontSize: 10,
    lineHeight: 13,
  },
  textMd: {
    fontSize: 11,
    lineHeight: 15,
  },
});

