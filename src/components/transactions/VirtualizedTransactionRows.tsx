import { fontFamilies, ThemeColors, typography } from '@/theme';
import type { TransactionWithAccount } from '@/types';
import {
  formatCurrency,
  formatTransactionTime,
  getTransactionSign,
  groupTransactionsByDate,
} from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';
import { getTransactionDisplayName, hasMeaningfulMerchant } from '@/utils/transaction-display';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useMemo } from 'react';
import { Platform, Pressable, Text as RNText, StyleSheet, View } from 'react-native';

export const SECTION_HEADER_HEIGHT = 44;
export const TRANSACTION_ROW_HEIGHT = 76;

export interface PreparedTransactionRow {
  id: string;
  title: string;
  subtitle: string;
  amountText: string;
  category: string;
  categoryIcon: ReturnType<typeof getCategoryIcon>;
  splitCount: number;
  tagLabel: string | null;
  hasReceipt: boolean;
  isCredit: boolean;
}

export type FlatTransactionListItem =
  | {
      kind: 'header';
      key: string;
      title: string;
      isFirst: boolean;
      offset: number;
      length: number;
    }
  | {
      kind: 'row';
      key: string;
      row: PreparedTransactionRow;
      isLastInSection: boolean;
      isVeryLast: boolean;
      offset: number;
      length: number;
    };

export function prepareTransactionRow(
  tx: TransactionWithAccount,
  filterAccountId?: string
): PreparedTransactionRow {
  const isIncomingTransfer =
    Boolean(filterAccountId) && tx.type === 'transfer' && tx.toAccountId === filterAccountId;
  const isOutgoingTransfer =
    Boolean(filterAccountId) && tx.type === 'transfer' && tx.accountId === filterAccountId;
  const isCredit = tx.type === 'income' || isIncomingTransfer;
  const sign = isCredit
    ? '+'
    : isOutgoingTransfer || tx.type === 'expense'
    ? '-'
    : getTransactionSign(tx.type);
  const hasMerchant = hasMeaningfulMerchant(tx);
  const title = getTransactionDisplayName(tx);
  const timeStr = formatTransactionTime(tx.date, tx.createdAt);

  const metaParts: string[] = [];
  if (timeStr) {
    metaParts.push(timeStr);
  }
  if (tx.type === 'transfer') {
    metaParts.push(`${tx.accountName} → ${tx.toAccountName || 'Unknown'}`);
  } else if (hasMerchant) {
    if (tx.accountName) metaParts.push(tx.accountName);
    metaParts.push(tx.category);
  } else if (tx.accountName) {
    metaParts.push(tx.accountName);
  }

  const tags = tx.tags;
  const tagLabel =
    tags && tags.length > 0
      ? `#${tags[0]}${tags.length > 1 ? ` +${tags.length - 1}` : ''}`
      : null;

  return {
    id: tx.id,
    title,
    subtitle: metaParts.join(' • '),
    amountText: `${sign}${formatCurrency(tx.amount)}`,
    category: tx.category,
    categoryIcon: getCategoryIcon(tx.category),
    splitCount: tx.splits?.length ?? 0,
    tagLabel,
    hasReceipt: Boolean(tx.receiptUri),
    isCredit,
  };
}

const preparedRowCacheByContext = new Map<
  string,
  WeakMap<TransactionWithAccount, PreparedTransactionRow>
>();

export function getPreparedTransactionRow(
  tx: TransactionWithAccount,
  currency: string,
  filterAccountId?: string
): PreparedTransactionRow {
  const contextKey = `${currency}:${filterAccountId ?? ''}`;
  let cache = preparedRowCacheByContext.get(contextKey);
  if (!cache) {
    cache = new WeakMap();
    preparedRowCacheByContext.set(contextKey, cache);
  }
  const cached = cache.get(tx);
  if (cached) {
    return cached;
  }
  const prepared = prepareTransactionRow(tx, filterAccountId);
  cache.set(tx, prepared);
  return prepared;
}

export function buildFlatTransactionListItems(
  transactions: TransactionWithAccount[],
  currency: string,
  filterAccountId?: string
): FlatTransactionListItem[] {
  if (transactions.length === 0) return [];
  const grouped = groupTransactionsByDate(transactions);
  if (grouped.length === 0) return [];

  const items: FlatTransactionListItem[] = [];
  const lastGroupIdx = grouped.length - 1;
  let offset = 0;

  for (let groupIndex = 0; groupIndex < grouped.length; groupIndex++) {
    const group = grouped[groupIndex];
    const isFirstGroup = groupIndex === 0;
    const isLastGroup = groupIndex === lastGroupIdx;

    items.push({
      kind: 'header',
      key: `header:${group.date}`,
      title: group.label,
      isFirst: isFirstGroup,
      offset,
      length: SECTION_HEADER_HEIGHT,
    });
    offset += SECTION_HEADER_HEIGHT;

    const lastRowIdx = group.items.length - 1;
    for (let rowIndex = 0; rowIndex < group.items.length; rowIndex++) {
      const tx = group.items[rowIndex];
      const isLastInSection = rowIndex === lastRowIdx;
      const isVeryLast = isLastGroup && isLastInSection;

      items.push({
        kind: 'row',
        key: tx.id,
        row: getPreparedTransactionRow(tx, currency, filterAccountId),
        isLastInSection,
        isVeryLast,
        offset,
        length: TRANSACTION_ROW_HEIGHT,
      });
      offset += TRANSACTION_ROW_HEIGHT;
    }
  }

  return items;
}

export function getTransactionListItemLayout(
  data: ArrayLike<FlatTransactionListItem> | null | undefined,
  index: number
) {
  const entry = data?.[index];
  if (entry) {
    return { length: entry.length, offset: entry.offset, index };
  }
  return { length: TRANSACTION_ROW_HEIGHT, offset: index * TRANSACTION_ROW_HEIGHT, index };
}

export const getTransactionListStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    dateGroupHeader: {
      backgroundColor: colors.surfaceContainerLow + '80',
      height: SECTION_HEADER_HEIGHT,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.outlineVariant,
    },
    dateGroupText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: Platform.OS === 'ios' ? 0.6 : 0,
    },
    firstSectionHeader: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
    },
    transactionItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: TRANSACTION_ROW_HEIGHT,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerLowest,
    },
    transactionItemSelected: {
      backgroundColor: colors.primaryContainer + '30',
    },
    transactionItemPressed: {
      opacity: 0.72,
    },
    transactionItemSectionLast: {
      borderBottomWidth: 0,
    },
    lastTransactionItem: {
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomWidth: 1,
    },
    transactionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 12,
    },
    transactionIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    transactionIconBoxCredit: {
      backgroundColor: colors.primaryContainer,
    },
    transactionTextCol: {
      flex: 1,
      justifyContent: 'center',
    },
    transactionName: {
      ...typography.bodyLg,
      fontFamily: fontFamilies.medium,
      ...(Platform.OS === 'ios' ? { fontWeight: '500' as const } : {}),
      color: colors.onSurface,
    },
    transactionMeta: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    transactionRight: {
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    transactionAmount: {
      fontFamily: fontFamilies.medium,
      fontSize: 20,
      lineHeight: 28,
      color: colors.onSurface,
      ...(Platform.OS === 'android' ? { includeFontPadding: false as const } : {}),
    },
    transactionAmountCredit: {
      color: colors.primary,
    },
    badgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    categoryBadge: {
      backgroundColor: colors.primary + '1A',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 2,
      marginTop: 4,
      flexShrink: 0,
    },
    secondaryBadge: {
      backgroundColor: colors.secondaryContainer,
    },
    tagBadge: {
      backgroundColor: colors.secondaryContainer,
      paddingHorizontal: 6,
    },
    receiptBadge: {
      backgroundColor: colors.surfaceContainerHighest,
      paddingHorizontal: 5,
    },
    categoryBadgeText: {
      fontFamily: fontFamilies.semiBold,
      fontSize: 11,
      lineHeight: 15,
      color: colors.primary,
      textTransform: 'uppercase',
      ...(Platform.OS === 'android' ? { includeFontPadding: false as const } : {}),
    },
    secondaryBadgeText: {
      color: colors.onSecondaryContainer,
    },
    selectionCheckbox: {
      marginRight: 10,
      justifyContent: 'center',
    },
  });
  return styles;
};

export type TransactionListStyles = ReturnType<typeof getTransactionListStyles>;

interface SectionHeaderItemProps {
  title: string;
  isFirst: boolean;
  styles: TransactionListStyles;
}

function SectionHeaderItemComponent({
  title,
  isFirst,
  styles,
}: SectionHeaderItemProps) {
  return (
    <View style={[styles.dateGroupHeader, isFirst && styles.firstSectionHeader]}>
      <RNText style={styles.dateGroupText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
        {title}
      </RNText>
    </View>
  );
}

export const SectionHeaderItem = React.memo(SectionHeaderItemComponent);

interface TransactionRowItemProps {
  item: PreparedTransactionRow;
  isLastInSection: boolean;
  isVeryLast: boolean;
  isSelected: boolean;
  hasSelectionMode: boolean;
  iconDefaultColor: string;
  iconCreditColor: string;
  primaryColor: string;
  outlineColor: string;
  styles: TransactionListStyles;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
}

function TransactionRowItemComponent({
  item,
  isLastInSection,
  isVeryLast,
  isSelected,
  hasSelectionMode,
  iconDefaultColor,
  iconCreditColor,
  primaryColor,
  outlineColor,
  styles,
  onPress,
  onLongPress,
}: TransactionRowItemProps) {
  const handleRowPress = useCallback(() => {
    onPress(item.id);
  }, [onPress, item.id]);

  const handleRowLongPress = useCallback(() => {
    onLongPress?.(item.id);
  }, [onLongPress, item.id]);

  const baseRowStyle = useMemo(
    () => [
      styles.transactionItem,
      isSelected && styles.transactionItemSelected,
      isVeryLast && styles.lastTransactionItem,
      isLastInSection && !isVeryLast && styles.transactionItemSectionLast,
    ],
    [styles, isSelected, isVeryLast, isLastInSection]
  );

  const pressedRowStyle = useMemo(
    () => [...baseRowStyle, styles.transactionItemPressed],
    [baseRowStyle, styles.transactionItemPressed]
  );

  const getRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => (pressed ? pressedRowStyle : baseRowStyle),
    [pressedRowStyle, baseRowStyle]
  );

  return (
    <Pressable
      style={getRowStyle}
      onPress={handleRowPress}
      onLongPress={onLongPress ? handleRowLongPress : undefined}
      delayLongPress={200}
    >
      {hasSelectionMode && (
        <View style={styles.selectionCheckbox}>
          <MaterialIcons
            name={isSelected ? 'check-circle' : 'radio-button-unchecked'}
            size={22}
            color={isSelected ? primaryColor : outlineColor}
          />
        </View>
      )}
      <View style={styles.transactionLeft}>
        <View
          style={[
            styles.transactionIconBox,
            item.isCredit && styles.transactionIconBoxCredit,
          ]}
        >
          <MaterialIcons
            name={item.categoryIcon}
            size={20}
            color={item.isCredit ? iconCreditColor : iconDefaultColor}
          />
        </View>
        <View style={styles.transactionTextCol}>
          <RNText style={styles.transactionName} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {item.title}
          </RNText>
          <RNText style={styles.transactionMeta} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {item.subtitle}
          </RNText>
        </View>
      </View>
      <View style={styles.transactionRight}>
        <RNText
          style={[
            styles.transactionAmount,
            item.isCredit && styles.transactionAmountCredit,
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
        >
          {item.amountText}
        </RNText>
        <View style={styles.badgesRow}>
          {item.splitCount > 0 && (
            <View style={[styles.categoryBadge, styles.secondaryBadge]}>
              <RNText
                style={[styles.categoryBadgeText, styles.secondaryBadgeText]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                Split ({item.splitCount})
              </RNText>
            </View>
          )}
          <View style={styles.categoryBadge}>
            <RNText style={styles.categoryBadgeText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {item.category}
            </RNText>
          </View>
          {item.tagLabel !== null && (
            <View style={[styles.categoryBadge, styles.tagBadge]}>
              <RNText
                style={[styles.categoryBadgeText, styles.secondaryBadgeText]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {item.tagLabel}
              </RNText>
            </View>
          )}
          {item.hasReceipt && (
            <View style={[styles.categoryBadge, styles.receiptBadge]}>
              <MaterialIcons name="receipt" size={12} color={primaryColor} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export const TransactionRowItem = React.memo(TransactionRowItemComponent);
