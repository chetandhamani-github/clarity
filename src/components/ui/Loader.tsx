import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '@/theme';
import { radius } from '@/theme/radius';
import { SkeletonBox, SkeletonCircle, SkeletonText } from './Skeleton';

export interface LoaderProps {
  style?: StyleProp<ViewStyle>;
}

export const Loader = ({ style }: LoaderProps) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <SkeletonCircle size={40} />
          <View style={styles.headerTextCol}>
            <SkeletonText width="60%" height={15} />
            <SkeletonText width="40%" height={11} />
          </View>
          <SkeletonBox width={60} height={24} borderRadius={radius.full} />
        </View>

        <SkeletonBox height={80} borderRadius={radius.md} style={styles.middleBox} />

        <View style={styles.footerLines}>
          <SkeletonText width="90%" height={13} />
          <SkeletonText width="70%" height={13} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTextCol: {
    flex: 1,
    gap: 6,
  },
  middleBox: {
    marginVertical: 14,
  },
  footerLines: {
    gap: 8,
  },
});
