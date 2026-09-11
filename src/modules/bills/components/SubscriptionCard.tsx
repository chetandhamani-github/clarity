import React from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Text, useToast } from '@/components/ui';
import { useTheme, typography, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { useBills } from '../hooks/useBills';
import { BillService } from '../services/BillService';
import type { Subscription } from '../types/bill.types';

interface SubscriptionCardProps {
  subscription: Subscription;
  onPress?: () => void;
}

export function SubscriptionCard({ subscription, onPress }: SubscriptionCardProps) {
  const { colors } = useTheme();
  const { hideBalances } = useAppStore();
  const { showToast } = useToast();
  const { deleteSubscription } = useBills();

  const monthlyCost = BillService.calculateMonthlyNormalizedCost(
    subscription.amount,
    subscription.billingCycle
  );

  const getSubIcon = (name: string): { icon: any; color: string; bg: string } => {
    const lower = name.toLowerCase();
    if (lower.includes('netflix')) {
      return { icon: 'movie', color: '#e50914', bg: 'rgba(229, 9, 20, 0.15)' };
    }
    if (lower.includes('spotify')) {
      return { icon: 'music-note', color: '#1db954', bg: 'rgba(29, 185, 84, 0.15)' };
    }
    if (lower.includes('prime') || lower.includes('amazon')) {
      return { icon: 'shopping-bag', color: '#00a8e1', bg: 'rgba(0, 168, 225, 0.15)' };
    }
    if (lower.includes('google') || lower.includes('youtube')) {
      return { icon: 'cloud', color: '#ea4335', bg: 'rgba(234, 67, 53, 0.15)' };
    }
    if (lower.includes('apple') || lower.includes('icloud')) {
      return { icon: 'phone-iphone', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' };
    }
    if (lower.includes('chatgpt') || lower.includes('openai')) {
      return { icon: 'smart-toy', color: '#10a37f', bg: 'rgba(16, 163, 127, 0.15)' };
    }
    if (lower.includes('gym') || lower.includes('fitness')) {
      return { icon: 'fitness-center', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
    }
    return { icon: 'subscriptions', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' };
  };

  const brand = getSubIcon(subscription.provider || subscription.name);

  // Date calculation
  const now = new Date();
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = subscription.nextRenewalDate.split('-').map(Number);
  const renewalTime = new Date(y, m - 1, d).getTime();
  const diffDays = Math.round((renewalTime - todayTime) / (1000 * 60 * 60 * 24));

  let renewalText = `Renews in ${diffDays}d`;
  if (diffDays === 0) renewalText = 'Renews Today';
  else if (diffDays === 1) renewalText = 'Renews Tomorrow';
  else if (diffDays < 0) renewalText = 'Renewal Due';

  const handleDelete = () => {
    Alert.alert('Delete Subscription', `Remove ${subscription.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSubscription(subscription.id);
          showToast('Subscription removed', 'success');
        },
      },
    ]);
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceContainerLow,
          borderColor: colors.outlineVariant,
        },
      ]}
      onPress={onPress || handleDelete}
      activeOpacity={0.88}
    >
      <View style={styles.cardMain}>
        <View style={[styles.iconBox, { backgroundColor: brand.bg }]}>
          <MaterialIcons name={brand.icon} size={22} color={brand.color} />
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>
              {subscription.name}
            </Text>
            <Text style={[styles.amount, { color: colors.onSurface }]}>
              {formatCurrencyPrivacy(subscription.amount, hideBalances)}
            </Text>
          </View>

          <View style={styles.subRow}>
            <Text style={[styles.cycleText, { color: colors.onSurfaceVariant }]}>
              {subscription.billingCycle.toUpperCase()} • {renewalText}
            </Text>
            {subscription.billingCycle !== 'monthly' && (
              <Text style={[styles.monthlyNormalized, { color: colors.primary }]}>
                ({formatCurrencyPrivacy(monthlyCost, hideBalances)}/mo)
              </Text>
            )}
          </View>

          <View style={styles.tagsRow}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    subscription.status === 'active'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(245, 158, 11, 0.15)',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      subscription.status === 'active' ? '#10b981' : '#f59e0b',
                  },
                ]}
              >
                {subscription.status.toUpperCase()}
              </Text>
            </View>

            <Text style={[styles.dateLabel, { color: colors.onSurfaceVariant }]}>
              Next: {subscription.nextRenewalDate}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardMain: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    ...typography.bodyLg,
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  amount: {
    ...typography.headlineSm,
    fontWeight: '800',
    fontSize: 16,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  cycleText: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '600',
  },
  monthlyNormalized: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '700',
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 10,
  },
  dateLabel: {
    ...typography.bodyMd,
    fontSize: 11,
  },
});
