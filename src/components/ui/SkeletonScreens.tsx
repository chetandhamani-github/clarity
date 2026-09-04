import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/theme';
import { radius } from '@/theme/radius';
import { SkeletonBox, SkeletonCircle, SkeletonText } from './Skeleton';

/**
 * Pixel-perfect Skeleton for Home Screen (`index.tsx`)
 */
export function HomeSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {/* Net Worth Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <SkeletonText width={120} height={12} />
          <SkeletonBox width={54} height={22} borderRadius={radius.full} />
        </View>
        <View style={{ marginTop: 12, marginBottom: 16 }}>
          <SkeletonText width={180} height={32} />
        </View>
        <SkeletonBox height={130} borderRadius={radius.lg} />
      </View>

      {/* Income / Expense Snapshot Row */}
      <View style={styles.rowGap12}>
        <View
          style={[
            styles.snapshotCard,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.surfaceVariant,
            },
          ]}
        >
          <SkeletonText width={60} height={10} style={{ marginBottom: 8 }} />
          <SkeletonText width={90} height={20} />
        </View>
        <View
          style={[
            styles.snapshotCard,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.surfaceVariant,
            },
          ]}
        >
          <SkeletonText width={60} height={10} style={{ marginBottom: 8 }} />
          <SkeletonText width={90} height={20} />
        </View>
      </View>

      {/* Budget Overview Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
            gap: 16,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <SkeletonText width={130} height={16} />
          <SkeletonText width={80} height={14} />
        </View>

        {[1, 2, 3].map((i) => (
          <View key={i} style={{ gap: 6 }}>
            <View style={styles.rowBetween}>
              <SkeletonText width={90} height={12} />
              <SkeletonText width={70} height={12} />
            </View>
            <SkeletonBox height={8} borderRadius={radius.full} />
          </View>
        ))}
      </View>

      {/* Recent Activity Card */}
      <View style={{ marginTop: 4, gap: 12 }}>
        <View style={styles.rowBetween}>
          <SkeletonText width={110} height={18} />
          <SkeletonText width={60} height={14} />
        </View>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.surfaceVariant,
              padding: 0,
            },
          ]}
        >
          {[1, 2, 3].map((i, index) => (
            <View
              key={i}
              style={[
                styles.transactionRow,
                index < 2 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.surfaceVariant,
                },
              ]}
            >
              <SkeletonCircle size={40} />
              <View style={{ flex: 1, gap: 6 }}>
                <SkeletonText width="65%" height={14} />
                <SkeletonText width="40%" height={11} />
              </View>
              <SkeletonText width={70} height={16} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Accounts Screen (`accounts.tsx`)
 */
export function AccountsSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.accountsContainer}>
      {/* Total Balance Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
            alignItems: 'center',
            gap: 10,
          },
        ]}
      >
        <SkeletonText width={100} height={12} />
        <SkeletonText width={190} height={32} />
        <SkeletonText width={70} height={12} />
      </View>

      {/* Active Accounts Section */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
            padding: 0,
          },
        ]}
      >
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <SkeletonText width={120} height={12} />
        </View>
        {[1, 2, 3, 4].map((i, index) => (
          <View
            key={i}
            style={[
              styles.transactionRow,
              index < 3 && {
                borderBottomWidth: 1,
                borderBottomColor: colors.surfaceVariant,
              },
            ]}
          >
            <SkeletonCircle size={40} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonText width="55%" height={15} />
              <SkeletonText width="35%" height={11} />
            </View>
            <SkeletonText width={80} height={16} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Transactions Screen (`transactions.tsx`)
 */
export function TransactionsSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {/* Horizontal Filter Chips */}
      <View style={[styles.rowGap12, { marginBottom: 8 }]}>
        {[60, 80, 75, 75].map((w, i) => (
          <SkeletonBox key={i} width={w} height={34} borderRadius={radius.full} />
        ))}
      </View>

      {/* Header text */}
      <View style={styles.rowBetween}>
        <SkeletonText width={120} height={18} />
        <SkeletonText width={90} height={14} />
      </View>

      {/* Grouped Transactions List */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
            padding: 0,
          },
        ]}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          <SkeletonText width={70} height={12} />
        </View>
        {[1, 2, 3, 4, 5].map((i, index) => (
          <View
            key={i}
            style={[
              styles.transactionRow,
              index < 4 && {
                borderBottomWidth: 1,
                borderBottomColor: colors.surfaceVariant,
              },
            ]}
          >
            <SkeletonCircle size={40} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonText width="60%" height={14} />
              <SkeletonText width="40%" height={11} />
            </View>
            <SkeletonText width={75} height={16} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Goals Screen (`goals.tsx`)
 */
export function GoalsSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {[1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.surfaceVariant,
              gap: 16,
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <SkeletonCircle size={40} />
              <View style={{ gap: 6 }}>
                <SkeletonText width={130} height={16} />
                <SkeletonText width={80} height={12} />
              </View>
            </View>
            <SkeletonText width={70} height={14} />
          </View>

          <SkeletonBox height={10} borderRadius={radius.full} />

          <View style={styles.rowBetween}>
            <SkeletonText width={110} height={13} />
            <SkeletonText width={75} height={13} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Plan Screen (`plan.tsx`)
 */
export function PlanSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {/* Header section */}
      <View style={styles.rowBetween}>
        <View style={{ gap: 4 }}>
          <SkeletonText width={110} height={18} />
          <SkeletonText width={80} height={12} />
        </View>
        <SkeletonBox width={100} height={32} borderRadius={radius.md} />
      </View>

      {/* Summary Grid (2x2) */}
      <View style={styles.grid2x2}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.gridCell,
              {
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.surfaceVariant,
              },
            ]}
          >
            <SkeletonText width={80} height={11} style={{ marginBottom: 6 }} />
            <SkeletonText width={100} height={18} />
          </View>
        ))}
      </View>

      {/* Allocation Cards (Needs, Wants, Savings) */}
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.surfaceVariant,
              gap: 12,
            },
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SkeletonCircle size={32} />
              <SkeletonText width={80} height={16} />
            </View>
            <SkeletonText width={60} height={14} />
          </View>
          <SkeletonBox height={8} borderRadius={radius.full} />
          <View style={styles.rowBetween}>
            <SkeletonText width={90} height={12} />
            <SkeletonText width={70} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Account / Goal Details Screen
 */
export function DetailSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {/* Header Info Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
            gap: 16,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={{ gap: 6, flex: 1 }}>
            <SkeletonText width={100} height={12} />
            <SkeletonText width={180} height={28} />
            <SkeletonText width={120} height={12} />
          </View>
          <SkeletonCircle size={48} />
        </View>

        {/* 3 Stats boxes */}
        <View style={styles.rowGap12}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.statBox,
                {
                  backgroundColor: colors.surfaceContainer,
                  borderColor: colors.surfaceVariant,
                },
              ]}
            >
              <SkeletonText width={40} height={10} style={{ marginBottom: 4 }} />
              <SkeletonText width={60} height={14} />
            </View>
          ))}
        </View>

        {/* Mini Chart */}
        <SkeletonBox height={110} borderRadius={radius.lg} />
      </View>

      {/* Action buttons */}
      <View style={styles.rowGap12}>
        <SkeletonBox width="48%" height={44} borderRadius={radius.md} />
        <SkeletonBox width="48%" height={44} borderRadius={radius.md} />
      </View>

      {/* Transactions */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
            padding: 0,
          },
        ]}
      >
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <SkeletonText width={130} height={14} />
        </View>
        {[1, 2, 3].map((i, index) => (
          <View
            key={i}
            style={[
              styles.transactionRow,
              index < 2 && {
                borderBottomWidth: 1,
                borderBottomColor: colors.surfaceVariant,
              },
            ]}
          >
            <SkeletonCircle size={36} />
            <View style={{ flex: 1, gap: 5 }}>
              <SkeletonText width="55%" height={14} />
              <SkeletonText width="35%" height={10} />
            </View>
            <SkeletonText width={70} height={15} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Form screens (e.g. `budget-setup.tsx`, `manage-categories.tsx`)
 */
export function FormSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <SkeletonText width="70%" height={16} style={{ marginBottom: 8 }} />

      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={{ gap: 6 }}>
          <SkeletonText width={90} height={12} />
          <SkeletonBox
            height={52}
            borderRadius={radius.lg}
            style={{
              backgroundColor: colors.surfaceContainerLowest,
              borderWidth: 1,
              borderColor: colors.surfaceVariant,
            }}
          />
        </View>
      ))}

      <SkeletonBox
        height={50}
        borderRadius={radius.md}
        style={{ marginTop: 16 }}
      />
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for List screens (Search, Notifications, Reports, Analytics)
 */
export function ListSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.surfaceVariant,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            },
          ]}
        >
          <SkeletonCircle size={42} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonText width="70%" height={14} />
            <SkeletonText width="45%" height={11} />
          </View>
          <SkeletonText width={60} height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 16,
  },
  accountsContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowGap12: {
    flexDirection: 'row',
    gap: 12,
  },
  snapshotCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  grid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCell: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  statBox: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
});
