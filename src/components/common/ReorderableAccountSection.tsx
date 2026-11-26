import { Text } from '@/components/ui';
import { useReorderAccounts } from '@/hooks/use-accounts';
import { ThemeColors, typography, useTheme } from '@/theme';
import type { Account } from '@/types';
import { formatCurrencyPrivacy } from '@/utils/format';
import { getAccountTypeIcon, getBankBranding } from '@/utils/icons';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  View,
  Platform,
} from 'react-native';

interface ReorderableAccountSectionProps {
  title: string;
  subtotalText: string;
  isLiability?: boolean;
  accounts: Account[];
  allAccounts: Account[];
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  hideBalances: boolean;
  onDragStateChange?: (isDragging: boolean) => void;
}

const ROW_HEIGHT = 76;
const GAP = 8;
const ROW_SLOT = ROW_HEIGHT + GAP;

function arrayMove<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

export function ReorderableAccountSection({
  title,
  subtotalText,
  isLiability = false,
  accounts,
  allAccounts,
  selectedAccountId,
  onSelectAccount,
  hideBalances,
  onDragStateChange,
}: ReorderableAccountSectionProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { reorder } = useReorderAccounts();

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const posAnims = useRef<{ [id: string]: Animated.Value }>({});
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const orderRef = useRef<string[]>(accounts.map((a) => a.id));
  const dragIndexRef = useRef<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const startPosRef = useRef(0);
  const isDraggingRef = useRef(false);
  const accountsRef = useRef(accounts);
  const allAccountsRef = useRef(allAccounts);

  useEffect(() => {
    accountsRef.current = accounts;
    allAccountsRef.current = allAccounts;

    if (!isDraggingRef.current) {
      orderRef.current = accounts.map((a) => a.id);
      accounts.forEach((acc, i) => {
        if (!posAnims.current[acc.id]) {
          posAnims.current[acc.id] = new Animated.Value(i * ROW_SLOT);
        } else {
          posAnims.current[acc.id].setValue(i * ROW_SLOT);
        }
      });
    }
  }, [accounts, allAccounts]);

  const commitReorder = (newSectionOrder: Account[]) => {
    const currentAll = allAccountsRef.current;
    const newAll = [...currentAll];
    let sectionIdx = 0;

    for (let i = 0; i < newAll.length; i++) {
      if (accountsRef.current.some((a) => a.id === newAll[i].id)) {
        newAll[i] = newSectionOrder[sectionIdx++];
      }
    }

    reorder(newAll);
  };

  const handleDragStart = (index: number, id: string, pageY: number) => {
    Vibration.vibrate(35);
    setActiveDragId(id);
    dragIndexRef.current = index;
    hoverIndexRef.current = index;
    startYRef.current = pageY;
    startPosRef.current = index * ROW_SLOT;
    isDraggingRef.current = true;
    onDragStateChange?.(true);

    Animated.spring(scaleAnim, {
      toValue: 1.04,
      useNativeDriver: false,
      bounciness: 4,
      speed: 20,
    }).start();
  };

  const handleDragMove = (pageY: number) => {
    if (!isDraggingRef.current || dragIndexRef.current === null) return;
    const dy = pageY - startYRef.current;
    const currentPos = startPosRef.current + dy;
    const maxPos = (orderRef.current.length - 1) * ROW_SLOT;
    const clampedPos = Math.max(0, Math.min(maxPos, currentPos));

    const activeId = orderRef.current[dragIndexRef.current];
    if (activeId && posAnims.current[activeId]) {
      posAnims.current[activeId].setValue(clampedPos);
    }

    const from = dragIndexRef.current;
    const slotShift =
      dy > 0
        ? Math.floor((dy + ROW_SLOT * 0.65) / ROW_SLOT)
        : Math.ceil((dy - ROW_SLOT * 0.65) / ROW_SLOT);
    const targetSlot = Math.max(0, Math.min(orderRef.current.length - 1, from + slotShift));

    if (targetSlot !== hoverIndexRef.current) {
      hoverIndexRef.current = targetSlot;
      Vibration.vibrate(15);

      const from = dragIndexRef.current;
      const to = targetSlot;

      orderRef.current.forEach((itemId, k) => {
        if (k === from) return;
        const anim = posAnims.current[itemId];
        if (!anim) return;

        let slotForK = k;
        if (from < to && k > from && k <= to) {
          slotForK = k - 1;
        } else if (to < from && k >= to && k < from) {
          slotForK = k + 1;
        }

        Animated.spring(anim, {
          toValue: slotForK * ROW_SLOT,
          useNativeDriver: false,
          bounciness: 0,
          speed: 26,
        }).start();
      });
    }
  };

  const handleDragEnd = () => {
    if (!isDraggingRef.current || dragIndexRef.current === null) {
      return;
    }

    const from = dragIndexRef.current;
    const to = hoverIndexRef.current ?? from;
    const activeId = orderRef.current[from];
    const targetY = to * ROW_SLOT;

    isDraggingRef.current = false;

    // Ensure all other items spring to their intended slots
    orderRef.current.forEach((itemId, k) => {
      if (k === from) return;
      const anim = posAnims.current[itemId];
      if (!anim) return;

      let slotForK = k;
      if (from < to && k > from && k <= to) {
        slotForK = k - 1;
      } else if (to < from && k >= to && k < from) {
        slotForK = k + 1;
      }

      Animated.spring(anim, {
        toValue: slotForK * ROW_SLOT,
        useNativeDriver: false,
        bounciness: 0,
        speed: 24,
      }).start();
    });

    Animated.parallel([
      Animated.spring(posAnims.current[activeId], {
        toValue: targetY,
        useNativeDriver: false,
        bounciness: 0,
        speed: 22,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: false,
        bounciness: 2,
        speed: 20,
      }),
    ]).start(() => {
      setActiveDragId(null);
      dragIndexRef.current = null;
      hoverIndexRef.current = null;
      onDragStateChange?.(false);

      if (from !== to) {
        const newOrderIds = arrayMove(orderRef.current, from, to);
        orderRef.current = newOrderIds;

        const accountMap = new Map(accountsRef.current.map((a) => [a.id, a]));
        const newSectionOrder = newOrderIds
          .map((id) => accountMap.get(id))
          .filter((a): a is Account => Boolean(a));

        accountsRef.current = newSectionOrder;
        commitReorder(newSectionOrder);
        Vibration.vibrate(20);
      }
    });
  };

  if (accounts.length === 0) return null;

  const totalContentHeight = accounts.length * ROW_SLOT - GAP;

  return (
    <View style={styles.sectionCard}>
      {/* Section Header Row */}
      <View style={styles.sectionHeaderRow}>
        <Text
          style={[
            styles.sectionHeaderLabel,
            isLiability && { color: colors.error },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.sectionSubtotal,
            isLiability && { color: colors.error },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {subtotalText}
        </Text>
      </View>

      {/* Account List */}
      <View
        style={{ height: totalContentHeight, position: 'relative' }}
        onTouchMove={(e: GestureResponderEvent) => {
          if (activeDragId !== null) {
            handleDragMove(e.nativeEvent.pageY);
          }
        }}
        onTouchEnd={() => {
          if (activeDragId !== null) {
            handleDragEnd();
          }
        }}
        onTouchCancel={() => {
          if (activeDragId !== null) {
            handleDragEnd();
          }
        }}
      >
        {accounts.map((account, index) => {
          const isSelected = selectedAccountId === account.id;
          const isDebt = isLiability && account.balance < 0;
          const branding = getBankBranding(account.institution || account.name);
          const isDragging = activeDragId === account.id;

          if (!posAnims.current[account.id]) {
            posAnims.current[account.id] = new Animated.Value(index * ROW_SLOT);
          }
          const posAnim = posAnims.current[account.id];

          const animatedStyle = {
            position: 'absolute' as const,
            top: 0,
            left: 0,
            right: 0,
            height: ROW_HEIGHT,
            borderRadius: 12,
            backgroundColor: isSelected
              ? colors.surfaceContainer
              : colors.surfaceContainerLowest,
            borderWidth: isDragging ? 1.5 : 1,
            borderColor: isDragging ? colors.primary : colors.surfaceVariant,
            transform: [
              { translateY: posAnim },
              { scale: isDragging ? scaleAnim : 1 },
            ],
            zIndex: isDragging ? 999 : 1,
            elevation: isDragging ? 6 : 0,
            ...(isDragging
              ? {
                  shadowColor: colors.onSurface,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                }
              : {}),
          };

          return (
            <Animated.View
              key={account.id}
              style={animatedStyle}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.accountItem}
                onPress={() => {
                  if (activeDragId === null) {
                    onSelectAccount(account.id);
                  }
                }}
                onLongPress={(e: GestureResponderEvent) => {
                  if (accounts.length > 1) {
                    const currentSlot = orderRef.current.indexOf(account.id);
                    handleDragStart(
                      currentSlot >= 0 ? currentSlot : index,
                      account.id,
                      e.nativeEvent.pageY
                    );
                  }
                }}
                delayLongPress={220}
              >
                {/* Left Side: Icon & Details */}
                <View style={styles.accountItemLeft}>
                  <View
                    style={[
                      styles.accountIconContainer,
                      {
                        backgroundColor: isSelected
                          ? colors.primaryContainer
                          : branding.backgroundColor,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={
                        account.institution
                          ? 'account-balance'
                          : getAccountTypeIcon(account.type)
                      }
                      size={22}
                      color={isSelected ? colors.onPrimaryContainer : branding.color}
                    />
                  </View>
                  <View style={styles.accountNameContainer}>
                    <Text style={styles.accountName} numberOfLines={1}>
                      {account.name}
                    </Text>
                    <View style={styles.accountBadgeRow}>
                      {account.institution ? (
                        <View
                          style={[
                            styles.bankBadge,
                            { backgroundColor: branding.backgroundColor },
                          ]}
                        >
                          <Text
                            style={[styles.bankBadgeText, { color: branding.color }]}
                            numberOfLines={1}
                          >
                            {branding.shortName}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.accountType} numberOfLines={1}>
                        {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
                        {account.lastFour ? ` •••• ${account.lastFour}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Right Side: Balance */}
                <View style={styles.accountItemRight}>
                  <Text
                    style={[
                      styles.accountBalanceActive,
                      isDebt && { color: colors.error },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {formatCurrencyPrivacy(account.balance, false, hideBalances)}
                  </Text>
                  {isDebt && (
                    <Text style={[styles.owedBadge, { color: colors.error }]}>
                      Due
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    sectionCard: {
      gap: 12,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionHeaderLabel: {
      ...typography.labelMd,
      color: colors.outline,
      letterSpacing: Platform.OS === 'ios' ? 0.8 : 0,
      fontFamily: 'Manrope_700Bold',
    },
    sectionSubtotal: {
      ...typography.headlineSm,
      fontSize: 16,
      color: colors.onSurface,
      fontFamily: 'Manrope_700Bold',
    },
    accountItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      borderRadius: 12,
      gap: 12,
    },
    accountItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    accountIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountNameContainer: {
      flex: 1,
    },
    accountName: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.onSurface,
    },
    accountBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    bankBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankBadgeText: {
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      lineHeight: 14,
      textAlignVertical: 'center',
    },
    accountType: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.outline,
    },
    accountItemRight: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    accountBalanceActive: {
      ...typography.headlineSm,
      fontSize: 16,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    owedBadge: {
      ...typography.labelMd,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
    },
  });
  return styles;
};
