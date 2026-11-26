import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useTheme, ThemeColors } from "@/theme";
import { radius } from '@/theme/radius';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Header } from './Header';
import { SkeletonBox, SkeletonCircle, SkeletonText } from './Skeleton';

/**
 * Pixel-perfect Skeleton for Home Screen (`index.tsx`)
 */
export function HomeSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* 1. Feature / SMS Auto-Tracking Banner Placeholder */}
      <View
        style={[
          styles.card,
          styles.s50,
        ]}
      >
        <View style={styles.s1}>
          <SkeletonCircle size={40} />
          <View style={styles.s2}>
            <SkeletonText width="65%" height={15} />
            <SkeletonText width="85%" height={11} />
          </View>
        </View>
        <SkeletonBox width={72} height={34} borderRadius={10} />
      </View>

      {/* 2. Net Worth Card */}
      <View
        style={[
          styles.card,
          styles.s51,
        ]}
      >
        <View style={styles.rowBetween}>
          <SkeletonText width={120} height={12} />
          <SkeletonBox width={54} height={22} borderRadius={radius.full} />
        </View>
        <View style={styles.s3}>
          <SkeletonText width={180} height={32} />
        </View>
        <SkeletonBox height={130} borderRadius={radius.lg} />
      </View>

      {/* 3. Safe to Spend Engine Widget */}
      <View
        style={[
          styles.card,
          styles.s52,
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.s4}>
            <SkeletonCircle size={32} />
            <View style={styles.s5}>
              <SkeletonText width={110} height={12} />
              <SkeletonText width={160} height={11} />
            </View>
          </View>
          <SkeletonBox width={64} height={24} borderRadius={radius.full} />
        </View>
        <SkeletonBox height={42} borderRadius={radius.md} />
      </View>

      {/* 4. Income / Expense / Saved Snapshot Row (3 cards) */}
      <View style={styles.rowGap8}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.snapshotCard,
              styles.s53,
            ]}
          >
            <SkeletonText width={48} height={10} style={styles.s6} />
            <SkeletonText width={68} height={18} />
          </View>
        ))}
      </View>

      {/* 5. Bank Accounts Section */}
      <View style={styles.s7}>
        <View style={styles.rowBetween}>
          <SkeletonText width={120} height={16} />
          <SkeletonText width={60} height={13} />
        </View>
        <View
          style={[
            styles.card,
            styles.s54,
          ]}
        >
          {[1, 2].map((i, index) => (
            <View
              key={i}
              style={[
                styles.transactionRow,
                index < 1 && styles.s55,
              ]}
            >
              <SkeletonCircle size={36} />
              <View style={styles.s8}>
                <SkeletonText width="55%" height={14} />
                <SkeletonText width="35%" height={10} />
              </View>
              <SkeletonText width={75} height={15} />
            </View>
          ))}
        </View>
      </View>

      {/* 6. Spending Summary & Budget Overview */}
      <View
        style={[
          styles.card,
          styles.s56,
        ]}
      >
        <View style={styles.rowBetween}>
          <SkeletonText width={130} height={16} />
          <SkeletonText width={80} height={14} />
        </View>

        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.s9}>
            <View style={styles.rowBetween}>
              <SkeletonText width={90} height={12} />
              <SkeletonText width={70} height={12} />
            </View>
            <SkeletonBox height={8} borderRadius={radius.full} />
          </View>
        ))}
      </View>

      {/* 7. Recent Activity */}
      <View style={styles.s10}>
        <View style={styles.rowBetween}>
          <SkeletonText width={110} height={18} />
          <SkeletonText width={60} height={14} />
        </View>
        <View
          style={[
            styles.card,
            styles.s54,
          ]}
        >
          {[1, 2, 3].map((i, index) => (
            <View
              key={i}
              style={[
                styles.transactionRow,
                index < 2 && styles.s55,
              ]}
            >
              <SkeletonCircle size={40} />
              <View style={styles.s2}>
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
 * Pixel-perfect Skeleton for Wealth & Portfolio Card
 */
export function WealthCardSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View
      style={[
        styles.card,
        styles.s57,
      ]}
    >
      <View style={styles.portfolioSkeletonHeader}>
        <SkeletonCircle size={40} />
        <View style={styles.s2}>
          <View style={styles.s11}>
            <SkeletonText width={130} height={16} />
            <SkeletonBox width={46} height={18} borderRadius={radius.full} />
          </View>
          <SkeletonText width={170} height={12} />
        </View>
        <SkeletonBox width={16} height={16} borderRadius={4} />
      </View>

      <View style={styles.s12}>
        <SkeletonBox width="100%" height={6} borderRadius={3} />
        <View style={styles.s13}>
          <SkeletonBox width={64} height={14} borderRadius={4} />
          <SkeletonBox width={72} height={14} borderRadius={4} />
          <SkeletonBox width={56} height={14} borderRadius={4} />
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
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.accountsContainer}>
      {/* Total Balance Card */}
      <View
        style={[
          styles.card,
          styles.s58,
        ]}
      >
        <SkeletonText width={100} height={12} />
        <SkeletonText width={190} height={32} />
        <SkeletonText width={70} height={12} />
      </View>

      {/* Wealth & Portfolio Card Skeleton */}
      <WealthCardSkeleton />

      {/* Active Accounts Section */}
      <View
        style={[
          styles.card,
          styles.s54,
        ]}
      >
        <View style={styles.s14}>
          <SkeletonText width={120} height={12} />
        </View>
        {[1, 2, 3, 4].map((i, index) => (
          <View
            key={i}
            style={[
              styles.transactionRow,
              index < 3 && styles.s55,
            ]}
          >
            <SkeletonCircle size={40} />
            <View style={styles.s2}>
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
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* Horizontal Filter Chips */}
      <View style={[styles.rowGap12, styles.s22]}>
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
          styles.s54,
        ]}
      >
        <View style={styles.s15}>
          <SkeletonText width={70} height={12} />
        </View>
        {[1, 2, 3, 4, 5].map((i, index) => (
          <View
            key={i}
            style={[
              styles.transactionRow,
              index < 4 && styles.s55,
            ]}
          >
            <SkeletonCircle size={40} />
            <View style={styles.s2}>
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

function TransactionsPaginationSkeletonComponent() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View
      style={[
        styles.card,
        styles.s59,
      ]}
    >
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.transactionRow,
            index < 2 && styles.s60,
          ]}
        >
          <SkeletonCircle size={40} />
          <View style={styles.s2}>
            <SkeletonText width={index % 2 === 0 ? '58%' : '48%'} height={14} />
            <SkeletonText width="38%" height={11} />
          </View>
          <View style={styles.s16}>
            <SkeletonText width={72} height={16} />
            <SkeletonBox width={54} height={16} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

export const TransactionsPaginationSkeleton = React.memo(TransactionsPaginationSkeletonComponent);

/**
 * Pixel-perfect Skeleton for Goals Screen (`goals.tsx`)
 */
export function GoalsSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {[1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            styles.s56,
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={styles.s17}>
              <SkeletonCircle size={40} />
              <View style={styles.s9}>
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
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* Header section */}
      <View style={styles.rowBetween}>
        <View style={styles.s18}>
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
              styles.s51,
            ]}
          >
            <SkeletonText width={80} height={11} style={styles.s6} />
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
            styles.s61,
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={styles.s19}>
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
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* Header Info Card */}
      <View
        style={[
          styles.card,
          styles.s56,
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.s20}>
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
                styles.s62,
              ]}
            >
              <SkeletonText width={40} height={10} style={styles.s21} />
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
          styles.s54,
        ]}
      >
        <View style={styles.s14}>
          <SkeletonText width={130} height={14} />
        </View>
        {[1, 2, 3].map((i, index) => (
          <View
            key={i}
            style={[
              styles.transactionRow,
              index < 2 && styles.s55,
            ]}
          >
            <SkeletonCircle size={36} />
            <View style={styles.s8}>
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
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      <SkeletonText width="70%" height={16} style={styles.s22} />

      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.s9}>
          <SkeletonText width={90} height={12} />
          <SkeletonBox
            height={52}
            borderRadius={radius.lg}
            style={styles.s23}
          />
        </View>
      ))}

      <SkeletonBox
        height={50}
        borderRadius={radius.md}
        style={styles.s24}
      />
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for List screens (Search, Notifications, Reports, Analytics)
 */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {Array.from({ length: count }, (_, idx) => idx + 1).map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            styles.s63,
          ]}
        >
          <SkeletonCircle size={42} />
          <View style={styles.s2}>
            <SkeletonText width="70%" height={14} />
            <SkeletonText width="45%" height={11} />
          </View>
          <SkeletonText width={60} height={14} />
        </View>
      ))}
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Bill Details Screen (`BillDetailsScreen.tsx`)
 */
export function BillDetailSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={[styles.screenContainer, styles.s64]}>
      <Header title="Bill Details" showBack />

      <ScrollView
        style={styles.s25}
        contentContainerStyle={[styles.billDetailScroll, styles.scrollContentPb24]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Hero Banner */}
        <View
          style={[
            styles.billDetailHero,
            styles.s65,
          ]}
        >
          <SkeletonCircle size={60} style={styles.s26} />
          <SkeletonText width={160} height={20} style={styles.s6} />
          <SkeletonText width={110} height={13} style={styles.s21} />
          <SkeletonText width={150} height={32} style={styles.s27} />
          <View style={styles.heroBadgeRow}>
            <SkeletonBox width={76} height={22} borderRadius={6} />
            <SkeletonBox width={64} height={22} borderRadius={6} />
          </View>
        </View>

        {/* Information Table */}
        <View
          style={[
            styles.billDetailSection,
            styles.s65,
          ]}
        >
          <SkeletonText width={80} height={11} style={styles.s28} />

          <View style={styles.infoRowBetween}>
            <SkeletonText width={60} height={13} />
            <SkeletonText width={90} height={13} />
          </View>
          <View style={[styles.divider, styles.s66]} />

          <View style={styles.infoRowBetween}>
            <SkeletonText width={65} height={13} />
            <SkeletonText width={80} height={13} />
          </View>
          <View style={[styles.divider, styles.s66]} />

          <View style={styles.infoRowBetween}>
            <SkeletonText width={90} height={13} />
            <SkeletonText width={105} height={13} />
          </View>
          <View style={[styles.divider, styles.s66]} />

          <View style={styles.infoRowBetween}>
            <SkeletonText width={110} height={13} />
            <SkeletonText width={85} height={13} />
          </View>
          <View style={[styles.divider, styles.s66]} />

          <View style={styles.infoRowBetween}>
            <SkeletonText width={50} height={13} />
            <SkeletonText width={60} height={13} />
          </View>
        </View>

        {/* Payment Link Card */}
        <View
          style={[
            styles.billDetailSection,
            styles.s65,
          ]}
        >
          <SkeletonText width={85} height={11} style={styles.s26} />
          <SkeletonBox width="100%" height={46} borderRadius={8} />
        </View>
      </ScrollView>

      {/* Bottom Sticky Action Bar */}
      <View
        style={[
          styles.billDetailBottomBar,
          styles.s67,
        ]}
      >
        <SkeletonBox width="100%" height={48} borderRadius={12} />
      </View>
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Wealth & Investments Screen (`investments.tsx`)
 */
export function InvestmentsSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* 1. Hero Card: Portfolio Net Wealth */}
      <View
        style={[
          styles.card,
          styles.s68,
        ]}
      >
        <View style={styles.rowBetween}>
          <SkeletonText width={150} height={12} />
          <SkeletonBox width={64} height={22} borderRadius={radius.full} />
        </View>

        <View style={styles.s3}>
          <SkeletonText width={200} height={32} />
        </View>

        {/* 3 Stats Breakdown Columns */}
        <View
          style={[
            styles.rowBetween,
            styles.s69,
          ]}
        >
          <View style={styles.s29}>
            <SkeletonText width={80} height={10} />
            <SkeletonText width={90} height={14} />
          </View>
          <View style={styles.s30} />
          <View style={styles.s29}>
            <SkeletonText width={90} height={10} />
            <SkeletonText width={85} height={14} />
          </View>
          <View style={styles.s30} />
          <View style={styles.s29}>
            <SkeletonText width={55} height={10} />
            <SkeletonText width={60} height={14} />
          </View>
        </View>
      </View>

      {/* 2. Asset Allocation Card */}
      <View
        style={[
          styles.card,
          styles.s70,
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.s31}>
            <SkeletonCircle size={18} />
            <SkeletonText width={110} height={14} />
          </View>
          <SkeletonText width={120} height={11} />
        </View>

        <View style={styles.s32}>
          {/* Donut Circle Placeholder */}
          <SkeletonCircle size={110} />

          {/* Legend Items */}
          <View style={styles.s33}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.s11}>
                <SkeletonCircle size={10} />
                <View style={styles.s34}>
                  <View style={styles.rowBetween}>
                    <SkeletonText width="55%" height={12} />
                    <SkeletonText width="25%" height={11} />
                  </View>
                  <SkeletonText width="40%" height={10} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 3. Maturity & SIP Horizon */}
      <View style={styles.s7}>
        <View style={styles.rowBetween}>
          <View style={styles.s31}>
            <SkeletonCircle size={18} />
            <SkeletonText width={150} height={14} />
          </View>
          <SkeletonText width={70} height={11} />
        </View>

        <View style={styles.s13}>
          {[1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.calendarCardSkeleton,
                styles.s51,
              ]}
            >
              <View style={styles.rowBetween}>
                <SkeletonCircle size={26} />
                <SkeletonBox width={64} height={18} borderRadius={radius.full} />
              </View>
              <SkeletonText width={100} height={13} style={styles.s35} />
              <SkeletonText width={80} height={16} style={styles.s36} />
              <SkeletonText width={110} height={11} style={styles.s37} />
            </View>
          ))}
        </View>
      </View>

      {/* 4. Filter Tabs */}
      <View style={styles.rowGap8}>
        {[80, 130, 90, 70].map((w, i) => (
          <SkeletonBox key={i} width={w} height={32} borderRadius={radius.full} />
        ))}
      </View>

      {/* 5. Holdings List */}
      <View style={styles.s7}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.card,
              styles.s71,
            ]}
          >
            <View style={styles.rowBetween}>
              <View style={styles.s1}>
                <SkeletonCircle size={40} />
                <View style={styles.s8}>
                  <SkeletonText width="65%" height={14} />
                  <SkeletonText width="40%" height={11} />
                </View>
              </View>
              <View style={styles.s38}>
                <SkeletonText width={75} height={15} />
                <SkeletonText width={55} height={12} />
              </View>
            </View>

            <View style={styles.s39}>
              <SkeletonBox width={90} height={20} borderRadius={radius.sm} />
              <SkeletonBox width={80} height={20} borderRadius={radius.sm} />
            </View>

            <View
              style={[
                styles.rowBetween,
                styles.s72,
              ]}
            >
              <SkeletonText width={100} height={11} />
              <SkeletonCircle size={18} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export const WealthSkeleton = InvestmentsSkeleton;

/**
 * Pixel-perfect Skeleton for Cashflow Screen (`cashflow.tsx`)
 */
export function CashflowSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* 1. HERO CARD: SAFE-TO-SPEND GAUGE */}
      <View
        style={[
          styles.card,
          styles.s68,
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.s40}>
            <SkeletonCircle size={16} />
            <SkeletonText width={180} height={11} />
          </View>
          <SkeletonBox width={100} height={22} borderRadius={radius.full} />
        </View>

        <View style={styles.s41}>
          <SkeletonText width={160} height={32} />
          <SkeletonText width={40} height={14} style={styles.s21} />
        </View>

        <SkeletonText width={220} height={12} style={styles.s42} />

        {/* 3 Columns Breakdown */}
        <View
          style={[
            styles.rowBetween,
            styles.s69,
          ]}
        >
          <View style={styles.s29}>
            <SkeletonText width={65} height={10} />
            <SkeletonText width={80} height={14} />
          </View>
          <View style={styles.s30} />
          <View style={styles.s29}>
            <SkeletonText width={65} height={10} />
            <SkeletonText width={80} height={14} />
          </View>
          <View style={styles.s30} />
          <View style={styles.s29}>
            <SkeletonText width={70} height={10} />
            <SkeletonText width={80} height={14} />
          </View>
        </View>
      </View>

      {/* 2. CARD 2: 30-DAY FORWARD RUNWAY CHART */}
      <View
        style={[
          styles.card,
          styles.s70,
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.s31}>
            <SkeletonCircle size={18} />
            <SkeletonText width={100} height={14} />
          </View>
          <SkeletonBox width={150} height={28} borderRadius={radius.full} />
        </View>

        <SkeletonText width="92%" height={11} style={styles.s43} />
        <SkeletonText width="65%" height={11} style={styles.s28} />

        <SkeletonBox height={135} borderRadius={radius.md} />

        <View style={[styles.rowBetween, styles.s73]}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonText key={i} width={38} height={10} />
          ))}
        </View>
      </View>

      {/* 3. CARD 3: SCHEDULED CASH FLOW OBLIGATIONS & INFLOWS */}
      <View style={styles.s7}>
        <View style={styles.rowBetween}>
          <View style={styles.s31}>
            <SkeletonCircle size={18} />
            <SkeletonText width={180} height={14} />
          </View>
          <SkeletonText width={60} height={12} />
        </View>

        {/* Filter Tabs */}
        <View style={styles.rowGap8}>
          {[48, 90, 70, 60].map((w, i) => (
            <SkeletonBox key={i} width={w} height={28} borderRadius={radius.full} />
          ))}
        </View>

        {/* Event Cards */}
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.card,
              styles.s71,
            ]}
          >
            <View style={styles.rowBetween}>
              <View style={styles.s1}>
                <SkeletonCircle size={38} />
                <View style={styles.s8}>
                  <SkeletonText width="65%" height={14} />
                  <SkeletonText width="40%" height={11} />
                </View>
              </View>
              <View style={styles.s38}>
                <SkeletonText width={70} height={15} />
                <SkeletonBox width={50} height={18} borderRadius={4} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Bills Screen (`BillsScreen.tsx`)
 */
export function BillsSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* 2x2 Summary Cards Grid */}
      <View style={styles.grid2x2}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.gridCell,
              styles.s74,
            ]}
          >
            <View style={styles.rowBetween}>
              <SkeletonText width={70} height={10} />
              <SkeletonCircle size={20} />
            </View>
            <SkeletonText width={90} height={20} style={styles.s44} />
            <SkeletonText width={75} height={11} />
          </View>
        ))}
      </View>

      {/* Tab Pills */}
      <View style={styles.rowGap8}>
        {[85, 65, 80, 105].map((w, i) => (
          <SkeletonBox key={i} width={w} height={34} borderRadius={radius.full} />
        ))}
      </View>

      {/* Bills List Cards */}
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            styles.s75,
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={styles.s1}>
              <SkeletonCircle size={40} />
              <View style={styles.s8}>
                <SkeletonText width="60%" height={14} />
                <SkeletonText width="40%" height={11} />
              </View>
            </View>
            <View style={styles.s38}>
              <SkeletonText width={75} height={15} />
              <SkeletonBox width={60} height={20} borderRadius={radius.full} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Splitwise Screen (`SplitwiseHomeScreen.tsx`)
 */
export function SplitwiseSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* Hero Banner Card */}
      <View
        style={[
          styles.card,
          styles.s61,
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.s18}>
            <SkeletonText width={130} height={11} />
            <SkeletonText width={170} height={28} />
          </View>
          <SkeletonBox width={80} height={26} borderRadius={radius.full} />
        </View>

        <View
          style={[
            styles.rowBetween,
            styles.s76,
          ]}
        >
          <View style={styles.s45}>
            <SkeletonText width={80} height={10} />
            <SkeletonText width={90} height={14} />
          </View>
          <View style={styles.s46}>
            <SkeletonText width={80} height={10} />
            <SkeletonText width={90} height={14} />
          </View>
        </View>
      </View>

      {/* View Switcher & Tabs */}
      <View style={styles.rowGap8}>
        <SkeletonBox width="48%" height={38} borderRadius={radius.lg} />
        <SkeletonBox width="48%" height={38} borderRadius={radius.lg} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.rowGap8}>
        {[55, 75, 70, 75].map((w, i) => (
          <SkeletonBox key={i} width={w} height={30} borderRadius={radius.full} />
        ))}
      </View>

      {/* Friends/Groups List */}
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            styles.s75,
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={styles.s1}>
              <SkeletonCircle size={44} />
              <View style={styles.s8}>
                <SkeletonText width="55%" height={15} />
                <SkeletonText width="35%" height={11} />
              </View>
            </View>
            <View style={styles.s38}>
              <SkeletonText width={65} height={12} />
              <SkeletonText width={80} height={15} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Pixel-perfect Skeleton for Debt Freedom Strategist Screen (`debt-payoff.tsx`)
 */
export function DebtPayoffSkeleton() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors, insets);

  return (
    <View style={styles.container}>
      {/* 1. Strategy Toggle Card */}
      <View
        style={[
          styles.card,
          styles.s77,
        ]}
      >
        <SkeletonBox width="49%" height={36} borderRadius={radius.full} />
        <SkeletonBox width="49%" height={36} borderRadius={radius.full} />
      </View>

      {/* Strategy Explainer Placeholder */}
      <View style={styles.s47}>
        <SkeletonText width="95%" height={11} />
        <SkeletonText width="60%" height={11} />
      </View>

      {/* 2. Hero Outcome Card */}
      <View
        style={[
          styles.card,
          styles.s78,
        ]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.s9}>
            <SkeletonText width={140} height={10} />
            <SkeletonText width={120} height={24} />
          </View>
          <SkeletonBox width={85} height={24} borderRadius={radius.full} />
        </View>

        <View
          style={[
            styles.rowBetween,
            styles.s79,
          ]}
        >
          <View style={styles.s29}>
            <SkeletonText width={60} height={10} />
            <SkeletonText width={75} height={14} />
          </View>
          <View style={styles.s48} />
          <View style={styles.s29}>
            <SkeletonText width={65} height={10} />
            <SkeletonText width={70} height={14} />
          </View>
          <View style={styles.s48} />
          <View style={styles.s29}>
            <SkeletonText width={70} height={10} />
            <SkeletonText width={75} height={14} />
          </View>
        </View>
      </View>

      {/* 3. Interactive Extra Payment Simulator Card */}
      <View
        style={[
          styles.card,
          styles.s80,
        ]}
      >
        <View style={styles.rowBetween}>
          <SkeletonText width={150} height={13} />
          <SkeletonText width={80} height={13} />
        </View>
        <SkeletonText width="85%" height={11} />
        <View style={styles.s49}>
          {[95, 75, 75, 80, 85].map((w, i) => (
            <SkeletonBox key={i} width={w} height={28} borderRadius={radius.full} />
          ))}
        </View>
      </View>

      {/* 4. Payoff Order & Timeline Section */}
      <View style={styles.s7}>
        <View style={styles.rowBetween}>
          <SkeletonText width={160} height={14} />
          <SkeletonText width={50} height={12} />
        </View>

        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.card,
              styles.s81,
            ]}
          >
            <View style={[styles.rowBetween, styles.s82]}>
              <View style={styles.s4}>
                <SkeletonCircle size={28} />
                <View style={styles.s8}>
                  <SkeletonText width="55%" height={14} />
                  <SkeletonText width="40%" height={10} />
                </View>
              </View>
              <SkeletonBox width={20} height={20} borderRadius={radius.sm} />
            </View>

            <View
              style={[
                styles.rowBetween,
                styles.s83,
              ]}
            >
              <View style={styles.s18}>
                <SkeletonText width={90} height={10} />
                <SkeletonText width={70} height={14} />
              </View>
              <View style={styles.s38}>
                <SkeletonText width={95} height={10} />
                <SkeletonText width={80} height={14} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors, insets: { top: number; bottom: number } = { top: 0, bottom: 0 }) => {
  const styles = StyleSheet.create({
  scrollContentPb24: {
    paddingBottom: 24,
  },
  s1: {
    flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1
  },
  s2: {
    flex: 1, gap: 6
  },
  s3: {
    marginTop: 12, marginBottom: 16
  },
  s4: {
    flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1
  },
  s5: {
    gap: 4, flex: 1
  },
  s6: {
    marginBottom: 6
  },
  s7: {
    gap: 10
  },
  s8: {
    flex: 1, gap: 5
  },
  s9: {
    gap: 6
  },
  s10: {
    gap: 12
  },
  s11: {
    flexDirection: 'row', alignItems: 'center', gap: 8
  },
  s12: {
    gap: 8
  },
  s13: {
    flexDirection: 'row', gap: 10
  },
  s14: {
    padding: 16, paddingBottom: 8
  },
  s15: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4
  },
  s16: {
    alignItems: 'flex-end', gap: 6
  },
  s17: {
    flexDirection: 'row', alignItems: 'center', gap: 12
  },
  s18: {
    gap: 4
  },
  s19: {
    flexDirection: 'row', alignItems: 'center', gap: 10
  },
  s20: {
    gap: 6, flex: 1
  },
  s21: {
    marginBottom: 4
  },
  s22: {
    marginBottom: 8
  },
  s23: {
    backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.surfaceVariant,
  },
  s24: {
    marginTop: 16
  },
  s25: {
    flex: 1
  },
  s26: {
    marginBottom: 12
  },
  s27: {
    marginVertical: 10
  },
  s28: {
    marginBottom: 14
  },
  s29: {
    flex: 1, alignItems: 'center', gap: 4
  },
  s30: {
    width: 1, height: 24, backgroundColor: colors.surfaceVariant
  },
  s31: {
    flexDirection: 'row', alignItems: 'center', gap: 6
  },
  s32: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14
  },
  s33: {
    flex: 1, gap: 10
  },
  s34: {
    flex: 1, gap: 4
  },
  s35: {
    marginTop: 6
  },
  s36: {
    marginTop: 2
  },
  s37: {
    marginTop: 4
  },
  s38: {
    alignItems: 'flex-end', gap: 4
  },
  s39: {
    flexDirection: 'row', gap: 8, marginTop: 10
  },
  s40: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1
  },
  s41: {
    flexDirection: 'row', alignItems: 'flex-end', marginTop: 12, gap: 6
  },
  s42: {
    marginTop: 8, marginBottom: 16
  },
  s43: {
    marginTop: 10, marginBottom: 4
  },
  s44: {
    marginVertical: 2
  },
  s45: {
    gap: 3
  },
  s46: {
    gap: 3, alignItems: 'flex-end'
  },
  s47: {
    gap: 4, paddingHorizontal: 4, marginTop: -4
  },
  s48: {
    width: 1, height: 24, backgroundColor: colors.surfaceContainerHigh
  },
  s49: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2
  },
  s50: {
    backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16,
  },
  s51: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant,
  },
  s52: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, padding: 16, gap: 12,
  },
  s53: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, padding: 12,
  },
  s54: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, padding: 0,
  },
  s55: {
    borderBottomWidth: 1, borderBottomColor: colors.surfaceVariant,
  },
  s56: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, gap: 16,
  },
  s57: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, gap: 14,
  },
  s58: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, alignItems: 'center', gap: 10,
  },
  s59: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, padding: 0, marginTop: 12, overflow: 'hidden',
  },
  s60: {
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
  },
  s61: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, gap: 12,
  },
  s62: {
    backgroundColor: colors.surfaceContainer, borderColor: colors.surfaceVariant,
  },
  s63: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  s64: {
    paddingTop: insets.top, backgroundColor: colors.background
  },
  s65: {
    backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant,
  },
  s66: {
    backgroundColor: colors.outlineVariant
  },
  s67: {
    backgroundColor: colors.surfaceContainerLow, borderTopColor: colors.outlineVariant, paddingBottom: Math.max(16, insets.bottom + 12),
  },
  s68: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, padding: 18, marginBottom: 0,
  },
  s69: {
    paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.surfaceVariant,
  },
  s70: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, padding: 16, marginBottom: 0,
  },
  s71: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, padding: 14, marginBottom: 0,
  },
  s72: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.surfaceVariant,
  },
  s73: {
    marginTop: 10
  },
  s74: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, gap: 6,
  },
  s75: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, padding: 14,
  },
  s76: {
    paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.surfaceVariant,
  },
  s77: {
    backgroundColor: colors.surfaceContainerLow, borderColor: colors.surfaceVariant, borderRadius: radius.full, padding: 4, flexDirection: 'row', gap: 6,
  },
  s78: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, borderRadius: radius.xl, padding: 16,
  },
  s79: {
    paddingTop: 14, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh,
  },
  s80: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, borderRadius: radius.xl, padding: 14, gap: 10,
  },
  s81: {
    backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceVariant, borderRadius: radius.xl, padding: 14,
  },
  s82: {
    marginBottom: 10
  },
  s83: {
    paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh,
  },
  container: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 16,
  },
  screenContainer: {
    flex: 1,
  },
  billDetailScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 16,
  },
  billDetailHero: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  billDetailSection: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
  },
  infoRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  billDetailBottomBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  rowGap8: {
    flexDirection: 'row',
    gap: 8,
  },
  calendarCardSkeleton: {
    width: 180,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
  },
  portfolioSkeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  });
  return styles;
};
