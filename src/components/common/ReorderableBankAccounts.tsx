import { Text } from '@/components/ui';
import { useReorderAccounts } from '@/hooks/use-accounts';
import { ThemeColors, typography, useTheme } from '@/theme';
import type { Account } from '@/types';
import { formatCurrencyPrivacy } from '@/utils/format';
import { getBankBranding } from '@/utils/icons';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    GestureResponderEvent,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Vibration,
    View,
} from 'react-native';

interface ReorderableBankAccountsProps {
  accounts: Account[];
  hideBalances: boolean;
  onAccountPress: (accountId: string) => void;
  onViewAll: () => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

const CARD_WIDTH = 160;
const GAP = 12;
const ITEM_SLOT = CARD_WIDTH + GAP;
const CARD_HEIGHT = 140;

function arrayMove<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

export function ReorderableBankAccounts({
  accounts,
  hideBalances,
  onAccountPress,
  onViewAll,
  onDragStateChange,
}: ReorderableBankAccountsProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { reorder } = useReorderAccounts();

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const posAnims = useRef<{ [id: string]: Animated.Value }>({});
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const orderRef = useRef<string[]>(accounts.map((a) => a.id));
  const dragIndexRef = useRef<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startPosRef = useRef(0);
  const isDraggingRef = useRef(false);
  const accountsRef = useRef(accounts);

  useEffect(() => {
    accountsRef.current = accounts;
    if (!isDraggingRef.current) {
      orderRef.current = accounts.map((a) => a.id);
      accounts.forEach((acc, i) => {
        if (!posAnims.current[acc.id]) {
          posAnims.current[acc.id] = new Animated.Value(i * ITEM_SLOT);
        } else {
          posAnims.current[acc.id].setValue(i * ITEM_SLOT);
        }
      });
    }
  }, [accounts]);

  const handleDragStart = (index: number, id: string, pageX: number) => {
    Vibration.vibrate(35);
    setActiveDragId(id);
    dragIndexRef.current = index;
    hoverIndexRef.current = index;
    startXRef.current = pageX;
    startPosRef.current = index * ITEM_SLOT;
    isDraggingRef.current = true;
    onDragStateChange?.(true);

    Animated.spring(scaleAnim, {
      toValue: 1.04,
      useNativeDriver: false,
      bounciness: 4,
      speed: 20,
    }).start();
  };

  const handleDragMove = (pageX: number) => {
    if (!isDraggingRef.current || dragIndexRef.current === null) return;
    const dx = pageX - startXRef.current;
    const currentPos = startPosRef.current + dx;
    const maxPos = (orderRef.current.length - 1) * ITEM_SLOT;
    const clampedPos = Math.max(0, Math.min(maxPos, currentPos));

    const activeId = orderRef.current[dragIndexRef.current];
    if (activeId && posAnims.current[activeId]) {
      posAnims.current[activeId].setValue(clampedPos);
    }

    const from = dragIndexRef.current;
    const slotShift =
      dx > 0
        ? Math.floor((dx + ITEM_SLOT * 0.65) / ITEM_SLOT)
        : Math.ceil((dx - ITEM_SLOT * 0.65) / ITEM_SLOT);
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
          toValue: slotForK * ITEM_SLOT,
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
    const targetX = to * ITEM_SLOT;

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
        toValue: slotForK * ITEM_SLOT,
        useNativeDriver: false,
        bounciness: 0,
        speed: 24,
      }).start();
    });

    Animated.parallel([
      Animated.spring(posAnims.current[activeId], {
        toValue: targetX,
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
        const newOrderedAccounts = newOrderIds
          .map((id) => accountMap.get(id))
          .filter((a): a is Account => Boolean(a));

        accountsRef.current = newOrderedAccounts;
        reorder(newOrderedAccounts);
        Vibration.vibrate(20);
      }
    });
  };

  if (accounts.length === 0) return null;

  const totalContentWidth = accounts.length * ITEM_SLOT - GAP;

  return (
    <View style={styles.sectionContainer}>
      {/* Section Header */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Bank Accounts</Text>
        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={onViewAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.viewAllText}>VIEW ALL</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={activeDragId === null}
        contentContainerStyle={[
          styles.scrollContent,
          { width: totalContentWidth + 8 },
        ]}
      >
        <View
          style={{ width: totalContentWidth, height: 152 }}
          onTouchMove={(e: GestureResponderEvent) => {
            if (activeDragId !== null) {
              handleDragMove(e.nativeEvent.pageX);
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
          {accounts.map((acc, index) => {
            const branding = getBankBranding(acc.institution || acc.name);
            const isDragging = activeDragId === acc.id;

            if (!posAnims.current[acc.id]) {
              posAnims.current[acc.id] = new Animated.Value(index * ITEM_SLOT);
            }
            const posAnim = posAnims.current[acc.id];

            const animatedStyle = {
              position: 'absolute' as const,
              top: 4,
              left: 0,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              borderRadius: 16,
              backgroundColor: colors.surfaceContainerLowest,
              borderWidth: isDragging ? 1.5 : 1,
              borderColor: isDragging ? colors.primary : colors.surfaceVariant,
              transform: [
                { translateX: posAnim },
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
                key={acc.id}
                style={animatedStyle}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.bankAccountCard}
                  onPress={() => {
                    if (activeDragId === null) {
                      onAccountPress(acc.id);
                    }
                  }}
                  onLongPress={(e: GestureResponderEvent) => {
                    if (accounts.length > 1) {
                      const currentSlot = orderRef.current.indexOf(acc.id);
                      handleDragStart(
                        currentSlot >= 0 ? currentSlot : index,
                        acc.id,
                        e.nativeEvent.pageX
                      );
                    }
                  }}
                  delayLongPress={220}
                >
                  {/* Bank Header / Badge */}
                  <View style={styles.cardHeader}>
                    <View
                      style={[
                        styles.bankIconCircle,
                        { backgroundColor: branding.backgroundColor },
                      ]}
                    >
                      <MaterialIcons
                        name="account-balance"
                        size={18}
                        color={branding.color}
                      />
                    </View>
                    <View
                      style={[
                        styles.bankPill,
                        { backgroundColor: branding.backgroundColor },
                      ]}
                    >
                      <Text style={[styles.bankPillText, { color: branding.color }]} numberOfLines={1}>
                        {branding.shortName}
                      </Text>
                    </View>
                  </View>

                  {/* Account Name & Balance */}
                  <View style={styles.cardBody}>
                    <Text style={styles.bankCardName} numberOfLines={1}>
                      {acc.name}
                    </Text>
                    <Text style={styles.bankCardType} numberOfLines={1}>
                      {acc.type.charAt(0).toUpperCase() + acc.type.slice(1)}
                      {acc.lastFour ? ` •••• ${acc.lastFour}` : ''}
                    </Text>
                    <Text
                      style={styles.bankCardBalance}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {formatCurrencyPrivacy(acc.balance, false, hideBalances)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    sectionContainer: {
      marginBottom: 24,
      gap: 12,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    viewAllButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    viewAllText: {
      ...typography.labelMd,
      color: colors.primary,
      fontFamily: 'Manrope_700Bold',
      letterSpacing: Platform.OS === 'ios' ? 0.5 : 0,
    },
    scrollContent: {
      paddingVertical: 2,
      paddingHorizontal: 2,
    },
    bankAccountCard: {
      flex: 1,
      borderRadius: 16,
      padding: 14,
      justifyContent: 'space-between',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    bankIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankPill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankPillText: {
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      lineHeight: 14,
      textAlignVertical: 'center',
    },
    cardBody: {
      marginTop: 12,
    },
    bankCardName: {
      ...typography.bodyMd,
      fontWeight: '600',
      color: colors.onSurface,
    },
    bankCardType: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.outline,
      marginTop: 2,
    },
    bankCardBalance: {
      ...typography.bodyLg,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
      fontWeight: '700',
      marginTop: 6,
    },
  });
  return styles;
};
