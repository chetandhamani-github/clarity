import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Text, Header, AccountsSkeleton, SkeletonBox, WealthCardSkeleton, renderChartPointerLabel } from '@/components/ui';
import { typography, useTheme, radius, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { useAccounts } from '@/hooks/use-accounts';
import { useAccountHistory } from '@/hooks/use-transactions';
import { usePortfolioSummary } from '@/hooks/use-investments';
import {
  formatCurrency,
  formatCurrencyPrivacy,
} from '@/utils/format';
import { summarizeAccounts } from '@/utils/account-metrics';
import { normalizeLineChartValues, padChartHistory } from '@/utils/chart-utils';
import { getLocalTodayYmd } from '@/utils/date';
import { getBankBranding } from '@/utils/icons';
import type { Account, PortfolioSummary } from '@/types';
import { useAppStore } from '@/store/use-app-store';
import { ReorderableAccountSection } from '@/components/common';
import { supportsStatementImport } from '@/services/export/statement-import-helpers';

interface AccountsScreenProps {
  showBack?: boolean;
}

export default function AccountsScreen({ showBack = false }: AccountsScreenProps = {}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();

  const { accounts, isLoading, refetch } = useAccounts();
  const {
    summary: portfolioSummary,
    isLoading: isPortfolioLoading,
    refetch: refetchPortfolio,
  } = usePortfolioSummary();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isDraggingAccounts, setIsDraggingAccounts] = useState(false);
  const { hideBalances, toggleHideBalances } = useAppStore();

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchPortfolio();
    }, [refetch, refetchPortfolio])
  );

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null;
  const {
    assetAccounts,
    liabilityAccounts,
    totalAssets,
    totalLiabilities,
    netBalance: totalBalance,
    assetSectionTotal,
    liabilitySectionTotal,
  } = summarizeAccounts(accounts);

  const containerInsetStyle = { paddingTop: insets.top, paddingBottom: showBack ? insets.bottom : 0 };

  return (
    <View style={[styles.container, containerInsetStyle]}>
      <Header
        isMainTab={!showBack}
        showBack={showBack}
        title="Accounts"
        leftNode={
          showBack ? undefined : (
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.navigate('/settings')}>
              <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
                <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
              </View>
            </TouchableOpacity>
          )
        }
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => router.navigate('/add-account')}>
            <MaterialIcons name="add" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        }
      />

      {accounts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceContainerLow }]}>
            <MaterialIcons name="account-balance" size={48} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No Accounts Added</Text>
          <Text style={styles.emptyDescription}>
            Add your bank, credit card, or cash wallet to calculate your net worth and track your balances.
          </Text>

          {/* Quick Starter Chips */}
          <View style={styles.quickStartSection}>
            <Text style={styles.quickStartLabel}>CHOOSE ACCOUNT TYPE</Text>
            <View style={styles.quickStartGrid}>
              <TouchableOpacity
                style={styles.quickStartChip}
                onPress={() =>
                  router.navigate({
                    pathname: '/add-account',
                    params: { initialType: 'savings' },
                  })
                }
              >
                <MaterialIcons name="account-balance" size={18} color={colors.primary} />
                <Text style={styles.quickStartChipText}>Bank Account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickStartChip}
                onPress={() =>
                  router.navigate({
                    pathname: '/add-account',
                    params: { initialType: 'credit' },
                  })
                }
              >
                <MaterialIcons name="credit-card" size={18} color={colors.primary} />
                <Text style={styles.quickStartChipText}>Credit Card</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickStartChip}
                onPress={() =>
                  router.navigate({
                    pathname: '/add-account',
                    params: { initialType: 'cash' },
                  })
                }
              >
                <MaterialIcons name="payments" size={18} color={colors.primary} />
                <Text style={styles.quickStartChipText}>Cash Wallet</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: colors.primary }]}
            onPress={() => router.navigate('/add-account')}
          >
            <MaterialIcons name="add" size={20} color={colors.onPrimary} />
            <Text style={[styles.emptyButtonText, { color: colors.onPrimary }]}>Add Account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.flex1}
          scrollEnabled={!isDraggingAccounts}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <AccountsSkeleton />
          ) : (
            <>
              <View style={styles.sectionsGap}>
                {/* Total Balance / Net Worth Card */}
                <View style={styles.contentPadding}>
                  <View style={styles.totalCard}>
                    <View style={styles.rowCenterGap6}>
                      <Text style={styles.totalLabel}>NET ACCOUNT BALANCE</Text>
                      <TouchableOpacity
                        onPress={toggleHideBalances}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.eyeButton}
                      >
                        <MaterialIcons
                          name={hideBalances ? 'visibility-off' : 'visibility'}
                          size={16}
                          color={colors.onPrimary}
                          style={styles.eyeIcon}
                        />
                      </TouchableOpacity>
                    </View>
                    <Text
                      style={styles.totalBalance}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {formatCurrencyPrivacy(totalBalance, false, hideBalances)}
                    </Text>
                    <View style={styles.summaryPillRow}>
                      <View
                        style={[styles.summaryPill, { backgroundColor: colors.surfaceContainerLow }]}
                      >
                        <Text
                          style={[styles.summaryPillLabel, { color: colors.primary }]}
                          numberOfLines={1}
                        >
                          Assets: {formatCurrencyPrivacy(totalAssets, false, hideBalances)}
                        </Text>
                      </View>
                      {totalLiabilities > 0 && (
                        <View
                          style={[
                            styles.summaryPill,
                            { backgroundColor: colors.errorContainer },
                          ]}
                        >
                          <Text
                            style={[styles.summaryPillLabel, { color: colors.onErrorContainer }]}
                            numberOfLines={1}
                          >
                            Liabilities: -{formatCurrencyPrivacy(totalLiabilities, false, hideBalances)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Wealth & Asset Allocation Cockpit Banner */}
                  {isPortfolioLoading && !portfolioSummary ? (
                    <WealthCardSkeleton />
                  ) : (
                    <WealthPortfolioCard
                      portfolioSummary={portfolioSummary}
                      hideBalances={hideBalances}
                      onPress={() => router.navigate('/(app)/investments')}
                      colors={colors}
                      styles={styles}
                    />
                  )}

                  {/* Assets Section */}
                  {assetAccounts.length > 0 && (
                    <ReorderableAccountSection
                      title="ASSETS"
                      subtotalText={formatCurrencyPrivacy(assetSectionTotal, false, hideBalances)}
                      accounts={assetAccounts}
                      allAccounts={accounts}
                      selectedAccountId={selectedAccountId}
                      onSelectAccount={setSelectedAccountId}
                      hideBalances={hideBalances}
                      onDragStateChange={setIsDraggingAccounts}
                    />
                  )}

                  {/* Liabilities & Debt Section */}
                  {liabilityAccounts.length > 0 && (
                    <View style={assetAccounts.length > 0 ? styles.liabilitySectionWithAssets : undefined}>
                      <ReorderableAccountSection
                        title="LIABILITIES & DEBT"
                        subtotalText={formatCurrencyPrivacy(liabilitySectionTotal, false, hideBalances)}
                        isLiability
                        accounts={liabilityAccounts}
                        allAccounts={accounts}
                        selectedAccountId={selectedAccountId}
                        onSelectAccount={setSelectedAccountId}
                        hideBalances={hideBalances}
                        onDragStateChange={setIsDraggingAccounts}
                      />

                      {totalLiabilities > 0 && (
                        <TouchableOpacity
                          style={styles.debtStrategistBanner}
                          onPress={() => router.push('/(app)/debt-payoff')}
                          activeOpacity={0.8}
                        >
                          <View style={styles.rowCenterGap10Flex1}>
                            <View style={[styles.debtStrategistIcon, styles.debtStrategistIconBg]}>
                              <MaterialIcons name="trending-down" size={18} color="#EF4444" />
                            </View>
                            <View style={styles.flex1}>
                              <Text style={styles.debtStrategistTitle}>Debt Payoff Strategist</Text>
                              <Text style={styles.debtStrategistSub}>Snowball vs. Avalanche roadmap</Text>
                            </View>
                          </View>
                          <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* Selected Account Details */}
                  {selectedAccount && (
                    <AccountDetailCard
                      account={selectedAccount}
                      colors={colors}
                      styles={styles}
                      onViewDetails={() =>
                        router.navigate({
                          pathname: '/account-details',
                          params: { accountId: selectedAccount.id },
                        })
                      }
                      onSettleDebt={() =>
                        router.navigate({
                          pathname: '/(app)/add-transaction',
                          params: {
                            type: 'transfer',
                            toAccountId: selectedAccount.id,
                            amount: Math.abs(selectedAccount.balance).toString(),
                          },
                        })
                      }
                    />
                  )}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

interface WealthPortfolioCardProps {
  portfolioSummary: PortfolioSummary | null;
  hideBalances: boolean;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
}

function WealthPortfolioCardComponent({
  portfolioSummary,
  hideBalances,
  onPress,
  colors,
  styles,
}: WealthPortfolioCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.portfolioCockpitCard,
        {
          backgroundColor: colors.surfaceContainerLowest,
          borderColor: colors.surfaceVariant,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={styles.portfolioHeaderRow}>
        <View style={styles.rowCenterGap10Flex1}>
          <View
            style={[
              styles.portfolioIconCircle,
              styles.portfolioIconBg,
            ]}
          >
            <MaterialIcons name="insights" size={20} color="#3B82F6" />
          </View>
          <View style={styles.flex1}>
            <View style={styles.rowCenterGap6}>
              <Text style={styles.portfolioCardTitle}>Wealth & Portfolio</Text>
              {portfolioSummary && portfolioSummary.unrealizedGainLoss !== 0 && (
                <View
                  style={[
                    styles.miniPnlBadge,
                    portfolioSummary.unrealizedGainLoss >= 0
                      ? styles.miniPnlPositiveBg
                      : styles.miniPnlNegativeBg,
                  ]}
                >
                  <Text
                    style={[
                      styles.miniPnlText,
                      portfolioSummary.unrealizedGainLoss >= 0
                        ? styles.miniPnlPositiveText
                        : styles.miniPnlNegativeText,
                    ]}
                    numberOfLines={1}
                  >
                    {portfolioSummary.unrealizedGainLoss >= 0 ? '+' : ''}
                    {portfolioSummary.gainLossPercentage.toFixed(1)}%
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.portfolioCardSubtitle} numberOfLines={1}>
              {portfolioSummary && portfolioSummary.holdingsCount > 0
                ? `${portfolioSummary.holdingsCount} assets • ${formatCurrencyPrivacy(portfolioSummary.totalPortfolioValue, false, hideBalances)}`
                : 'Track Mutual Funds, Stocks, FDs, Gold & SIPs'}
            </Text>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
      </View>

      {/* Allocation Horizontal Stacked Bar */}
      {portfolioSummary && portfolioSummary.allocations.length > 0 && (
        <View style={styles.allocationBarContainer}>
          <View style={styles.allocationStackedBar}>
            {portfolioSummary.allocations.map((alloc) => (
              <View
                key={alloc.assetClass}
                style={[
                  styles.allocationSegment,
                  {
                    flex: Math.max(alloc.percentage, 2),
                    backgroundColor: alloc.color,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.allocationPillsRow}>
            {portfolioSummary.allocations.slice(0, 4).map((alloc) => (
              <View key={alloc.assetClass} style={styles.miniAllocPill}>
                <View style={[styles.miniDot, { backgroundColor: alloc.color }]} />
                <Text style={styles.miniAllocText}>
                  {alloc.label.split(' ')[0]}: {alloc.percentage}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const WealthPortfolioCard = React.memo(WealthPortfolioCardComponent);

function AccountDetailCard({
  account,
  colors,
  styles,
  onViewDetails,
  onSettleDebt,
}: {
  account: Account;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
  onViewDetails: () => void;
  onSettleDebt?: () => void;
}) {
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const isLiability = ['credit', 'loan', 'borrowed'].includes(account.type);
  const hasOutstandingDebt = isLiability && account.balance < 0;
  const { history, isLoading } = useAccountHistory(account.id, 30);

  const paddedHistory = React.useMemo(
    () => padChartHistory(history, account.balance, getLocalTodayYmd()),
    [history, account.balance]
  );

  const chartConfig = React.useMemo(
    () => normalizeLineChartValues(paddedHistory.map((point) => point.value)),
    [paddedHistory]
  );

  const chartData = React.useMemo(
    () =>
      paddedHistory.map((point, index) => ({
        value: chartConfig.values[index] ?? 0,
        dataPointText: formatCurrencyPrivacy(point.value, false, hideBalances),
      })),
    [paddedHistory, chartConfig.values, hideBalances]
  );

  const { width: screenWidth } = useWindowDimensions();
  // screen padding 20x2 = 40, card padding 16x2 = 32, borders 4 -> total 76
  const chartWidth = Math.max(160, screenWidth - 76);

  const branding = getBankBranding(account.institution || account.name);

  const creditDetails = React.useMemo(() => {
    if (account.type !== 'credit') return null;
    const limit = account.creditLimit || 0;
    const spent = Math.abs(account.balance);
    const utilization = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
    const available = limit > 0 ? Math.max(0, limit - spent) : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let nextStatementText = '—';
    if (account.billingCycleDay) {
      const year = today.getFullYear();
      const month = today.getMonth();
      let candidate = new Date(year, month, account.billingCycleDay);
      if (candidate < today) {
        candidate = new Date(year, month + 1, account.billingCycleDay);
      }
      nextStatementText = candidate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }

    let nextDueDateText = '—';
    let daysUntilDue: number | null = null;
    if (account.dueDay) {
      const year = today.getFullYear();
      const month = today.getMonth();
      let candidate = new Date(year, month, account.dueDay);
      if (candidate < today) {
        candidate = new Date(year, month + 1, account.dueDay);
      }
      nextDueDateText = candidate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      daysUntilDue = Math.ceil((candidate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      limit,
      spent,
      utilization,
      available,
      nextStatementText,
      nextDueDateText,
      daysUntilDue,
    };
  }, [account]);

  return (
    <View style={styles.sectionCard}>
      <View style={styles.detailsHeader}>
        <View style={styles.detailsHeaderLeft}>
          <View style={styles.detailsLabelRow}>
            <Text style={styles.detailsLabel} numberOfLines={1}>{account.name.toUpperCase()}</Text>
            {account.institution ? (
              <View style={[styles.bankBadge, { backgroundColor: branding.backgroundColor }]}>
                <Text style={[styles.bankBadgeText, { color: branding.color }]} numberOfLines={1}>
                  {branding.shortName}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={styles.detailsBalance}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatCurrencyPrivacy(account.balance, false, hideBalances)}
          </Text>
          {account.institution ? (
            <Text style={styles.institutionText} numberOfLines={1}>{account.institution}</Text>
          ) : null}
        </View>
        <View style={styles.detailsHeaderRight}>
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() =>
              router.navigate({
                pathname: '/add-account',
                params: { id: account.id },
              })
            }
          >
            <MaterialIcons name="edit" size={18} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.moreButton} onPress={onViewDetails}>
            <MaterialIcons name="more-horiz" size={20} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.chartArea}>
        <View style={styles.chartBg} />
        {isLoading ? (
          <View style={styles.chartSkeletonWrap}>
            <SkeletonBox width="100%" height={120} borderRadius={radius.md} />
          </View>
        ) : (
          <View style={styles.chartOverlay}>
            <LineChart
              data={chartData}
              width={chartWidth}
              height={140}
              spacing={
                chartData.length > 1 ? chartWidth / (chartData.length - 1) : chartWidth
              }
              adjustToWidth={true}
              maxValue={chartConfig.maxValue}
              yAxisLabelWidth={0}
              yAxisThickness={0}
              xAxisThickness={0}
              xAxisLabelsHeight={0}
              labelsExtraHeight={0}
              hideDataPoints
              hideRules
              hideYAxisText
              hideAxesAndRules
              color={colors.primary}
              thickness={2.5}
              initialSpacing={0}
              endSpacing={0}
              areaChart
              startFillColor={colors.primary}
              startOpacity={0.25}
              endFillColor={colors.primary}
              endOpacity={0.02}
              curved={chartConfig.hasVariance && chartData.length > 2}
              pointerConfig={{
                pointerStripHeight: 140,
                pointerStripColor: colors.outline,
                pointerStripWidth: 2,
                pointerColor: colors.primary,
                radius: 4,
                pointerLabelWidth: 116,
                pointerLabelHeight: 32,
                activatePointersOnLongPress: true,
                autoAdjustPointerLabelPosition: true,
                pointerLabelComponent: renderChartPointerLabel,
              }}
            />
          </View>
        )}
        <Text style={styles.chartTimeframe}>30 Days</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Type</Text>
          <Text style={styles.statValue}>
            {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Account</Text>
          <Text style={styles.statValue}>
            {account.lastFour ? `•••• ${account.lastFour}` : '—'}
          </Text>
        </View>
      </View>

      {/* Credit Card Specific Stats: Utilization & Cycle */}
      {creditDetails && (
        <View style={styles.creditCardDetailsBox}>
          {creditDetails.limit > 0 ? (
            <View style={styles.utilizationContainer}>
              <View style={styles.utilizationHeaderRow}>
                <View style={styles.rowGap6}>
                  <MaterialIcons name="credit-card" size={16} color={colors.onSurfaceVariant} />
                  <Text style={[styles.statLabel, styles.noMarginBottom]}>Credit Utilization</Text>
                </View>
                <View
                  style={[
                    styles.utilizationBadge,
                    {
                      backgroundColor:
                        creditDetails.utilization >= 80
                          ? colors.error + '20'
                          : creditDetails.utilization > 30
                          ? '#F59E0B20'
                          : '#10B98120',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.utilizationBadgeText,
                      {
                        color:
                          creditDetails.utilization >= 80
                            ? colors.error
                            : creditDetails.utilization > 30
                            ? '#F59E0B'
                            : '#10B981',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {creditDetails.utilization}% {creditDetails.utilization > 30 ? (creditDetails.utilization >= 80 ? 'Critical' : 'Caution') : 'Safe (<30%)'}
                  </Text>
                </View>
              </View>

              <View style={styles.utilizationProgressTrack}>
                <View
                  style={[
                    styles.utilizationProgressFill,
                    {
                      width: `${creditDetails.utilization}%`,
                      backgroundColor:
                        creditDetails.utilization >= 80
                          ? colors.error
                          : creditDetails.utilization > 30
                          ? '#F59E0B'
                          : '#10B981',
                    },
                  ]}
                />
              </View>

              <View style={styles.utilizationFooterRow}>
                <Text style={styles.utilizationSubtext} numberOfLines={1}>
                  Used: {formatCurrency(creditDetails.spent)} / Limit: {formatCurrency(creditDetails.limit)}
                </Text>
                <Text style={[styles.utilizationSubtext, { color: colors.primary }, styles.boldFont]} numberOfLines={1}>
                  {formatCurrency(creditDetails.available)} available
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.setLimitBanner}
              onPress={() => router.navigate({ pathname: '/add-account', params: { id: account.id } })}
            >
              <MaterialIcons name="tune" size={16} color={colors.primary} />
              <Text style={[styles.setLimitBannerText, { color: colors.primary }]}>
                Set credit limit & billing cycle to track utilization
              </Text>
            </TouchableOpacity>
          )}

          {/* Statement & Due Date Row */}
          {(account.billingCycleDay || account.dueDay) && (
            <View style={styles.cycleGrid}>
              {account.billingCycleDay ? (
                <View style={styles.cycleBox}>
                  <Text style={styles.cycleLabel}>Statement Date</Text>
                  <Text style={styles.cycleValue}>{creditDetails.nextStatementText}</Text>
                </View>
              ) : null}
              {account.dueDay ? (
                <View style={styles.cycleBox}>
                  <Text style={styles.cycleLabel}>Payment Due Date</Text>
                  <View style={styles.rowGap6}>
                    <Text style={styles.cycleValue}>{creditDetails.nextDueDateText}</Text>
                    {creditDetails.daysUntilDue !== null && (
                      <View
                        style={[
                          styles.dueBadge,
                          {
                            backgroundColor:
                              creditDetails.daysUntilDue <= 3 ? colors.error + '20' : colors.primaryContainer,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dueBadgeText,
                            {
                              color:
                                creditDetails.daysUntilDue <= 3 ? colors.error : colors.onPrimaryContainer,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {creditDetails.daysUntilDue === 0 ? 'Due Today' : `${creditDetails.daysUntilDue}d left`}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}

      {hasOutstandingDebt && onSettleDebt && (
        <TouchableOpacity style={styles.payBillButton} onPress={onSettleDebt}>
          <MaterialIcons name="payment" size={18} color={colors.onPrimary} />
          <Text style={styles.payBillButtonText} numberOfLines={1}>Pay Bill / Settle Debt</Text>
        </TouchableOpacity>
      )}

      {supportsStatementImport(account.type) && (
        <TouchableOpacity
          style={[
            styles.importStatementButton,
            hasOutstandingDebt && onSettleDebt
              ? styles.importStatementMarginCompact
              : styles.importStatementMarginDefault,
          ]}
          onPress={() =>
            router.navigate({
              pathname: '/(app)/import-statement',
              params: { accountId: account.id },
            })
          }
          activeOpacity={0.8}
        >
          <MaterialIcons name="upload-file" size={18} color={colors.primary} />
          <Text style={styles.importStatementButtonText} numberOfLines={1}>
            Import Statement (PDF / CSV)
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
    },
    flex1: {
      flex: 1,
    },
    rowGap6: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    noMarginBottom: {
      marginBottom: 0,
    },
    boldFont: {
      fontFamily: 'Manrope_700Bold',
    },
    importStatementMarginCompact: {
      marginTop: 10,
    },
    importStatementMarginDefault: {
      marginTop: 16,
    },
    sectionsGap: {
      gap: 24,
    },
    rowCenterGap6: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rowCenterGap10Flex1: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    eyeButton: {
      padding: 2,
    },
    eyeIcon: {
      opacity: 0.8,
    },
    liabilitySectionWithAssets: {
      marginTop: 16,
    },
    debtStrategistIconBg: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
    },
    portfolioIconBg: {
      backgroundColor: 'rgba(59, 130, 246, 0.12)',
    },
    miniPnlPositiveBg: {
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    miniPnlNegativeBg: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
    },
    miniPnlPositiveText: {
      color: '#10B981',
    },
    miniPnlNegativeText: {
      color: '#EF4444',
    },
    allocationSegment: {
      height: 6,
    },
    detailsLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    chartSkeletonWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    chartOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },

    avatarButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    avatarFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyIconCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    emptyTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
      marginBottom: 8,
    },
    emptyDescription: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: 24,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 12,
    },
    emptyButtonText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      lineHeight: 20,
    },
    quickStartSection: {
      width: '100%',
      marginBottom: 24,
      alignItems: 'center',
      gap: 10,
    },
    quickStartLabel: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      letterSpacing: Platform.OS === 'ios' ? 0.8 : 0,
    },
    quickStartGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
    },
    quickStartChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    quickStartChipText: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontFamily: 'Manrope_600SemiBold',
    },
    scrollContent: {},
    contentPadding: {
      paddingHorizontal: 20,
      gap: 24,
    },
    totalCard: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      gap: 4,
    },
    totalLabel: {
      ...typography.labelMd,
      color: colors.onPrimary,
      opacity: 0.8,
      letterSpacing: Platform.OS === 'ios' ? 1 : 0,
    },
    totalBalance: {
      ...typography.dataLg,
      color: colors.onPrimary,
      fontSize: 32,
      lineHeight: 40,
    },
    summaryPillRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    summaryPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    summaryPillLabel: {
      ...typography.labelMd,
      fontWeight: '600',
    },
    payBillButton: {
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      paddingVertical: 12,
      marginTop: 16,
    },
    payBillButtonText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      lineHeight: 20,
      color: colors.onPrimary,
    },
    importStatementButton: {
      backgroundColor: colors.surfaceContainerLow,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    importStatementButtonText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 13,
      lineHeight: 18,
      color: colors.primary,
    },
    sectionCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 16,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.02,
      shadowRadius: 24,
      elevation: 2,
    },
    detailsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
      gap: 12,
    },
    detailsHeaderLeft: {
      flex: 1,
    },
    detailsHeaderRight: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      flexShrink: 0,
    },
    detailsLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: Platform.OS === 'ios' ? 0.6 : 0,
      marginBottom: 4,
    },
    detailsBalance: {
      ...typography.dataLg,
      color: colors.onSurface,
    },
    institutionText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginTop: 4,
    },
    moreButton: {
      padding: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    chartArea: {
      width: '100%',
      height: 192,
      marginBottom: 24,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      overflow: 'hidden',
      position: 'relative',
      justifyContent: 'flex-end',
    },
    chartBg: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.primaryContainer,
      opacity: 0.05,
    },
    chartTimeframe: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginLeft: 16,
      marginBottom: 8,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 16,
    },
    statBox: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    statLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 4,
    },
    statValue: {
      ...typography.bodyLg,
      fontWeight: '600',
      color: colors.onSurface,
    },
    bankBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 4,
      alignSelf: 'flex-start',
      flexShrink: 0,
    },
    bankBadgeText: {
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: Platform.OS === 'ios' ? 0.5 : 0,
    },
    creditCardDetailsBox: {
      marginTop: 12,
      gap: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
    },
    utilizationContainer: {
      gap: 6,
    },
    utilizationHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    utilizationBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    utilizationBadgeText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      lineHeight: 14,
      textAlignVertical: 'center',
    },
    utilizationProgressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surfaceContainer,
      overflow: 'hidden',
    },
    utilizationProgressFill: {
      height: '100%',
      borderRadius: 3,
    },
    utilizationFooterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    utilizationSubtext: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    setLimitBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
    },
    setLimitBannerText: {
      ...typography.labelMd,
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
      flexShrink: 1,
    },
    cycleGrid: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 12,
      padding: 10,
    },
    cycleBox: {
      flex: 1,
    },
    cycleLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginBottom: 2,
    },
    cycleValue: {
      ...typography.labelMd,
      fontSize: 13,
      fontWeight: '700',
      color: colors.onSurface,
    },
    dueBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dueBadgeText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      lineHeight: 14,
      textAlignVertical: 'center',
    },
    portfolioCockpitCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      marginTop: 14,
    },
    portfolioHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    portfolioIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    portfolioCardTitle: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      lineHeight: 18,
      color: colors.onSurface,
    },
    portfolioCardSubtitle: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    miniPnlBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniPnlText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
      lineHeight: 14,
      textAlignVertical: 'center',
    },
    allocationBarContainer: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    allocationStackedBar: {
      flexDirection: 'row',
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 8,
    },
    allocationPillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    miniAllocPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    miniDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    miniAllocText: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
    },
    debtStrategistBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 12,
      marginTop: 10,
    },
    debtStrategistIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    debtStrategistTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    debtStrategistSub: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
  });
  return styles;
};
