import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { ThemeColors, useTheme } from '@/theme/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
    ActivityIndicator,
    StyleProp,
    StyleSheet,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { Text } from './Text';

export interface NoNetworkViewProps {
  variant?: 'fullscreen' | 'card' | 'banner';
  title?: string;
  message?: string;
  onRetry?: () => Promise<unknown> | unknown;
  isRetrying?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: keyof typeof MaterialIcons.glyphMap;
  retryText?: string;
}

export function NoNetworkView({
  variant = 'fullscreen',
  title,
  message,
  onRetry,
  isRetrying = false,
  style,
  icon = 'wifi-off',
  retryText,
}: NoNetworkViewProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [internalLoading, setInternalLoading] = useState(false);

  const loading = isRetrying || internalLoading;

  const handleRetry = async () => {
    if (!onRetry || loading) return;
    setInternalLoading(true);
    try {
      await onRetry();
    } finally {
      setInternalLoading(false);
    }
  };

  if (variant === 'banner') {
    return (
      <View style={[styles.bannerContainer, style]}>
        <View style={styles.bannerContentRow}>
          <MaterialIcons name={icon} size={18} color={colors.onErrorContainer} />
          <Text
            variant="bodyMd"
            style={[styles.bannerText, { color: colors.onErrorContainer }]}
            numberOfLines={2}
          >
            {message || 'You are offline. Connect to internet to use Clarity AI.'}
          </Text>
        </View>
        {onRetry && (
          <TouchableOpacity
            onPress={handleRetry}
            disabled={loading}
            activeOpacity={0.7}
            style={styles.bannerActionBtn}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.onErrorContainer} />
            ) : (
              <Text style={[styles.bannerActionText, { color: colors.onErrorContainer }]}>
                {retryText || 'Retry'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (variant === 'card') {
    return (
      <View style={[styles.cardContainer, style]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardIconWrapper}>
            <MaterialIcons name={icon} size={22} color={colors.onSurfaceVariant} />
          </View>
          <View style={styles.cardTextCol}>
            <Text variant="headlineSm" style={[styles.cardTitle, { color: colors.onSurface }]}>
              {title || 'Internet Connection Required'}
            </Text>
            <Text
              variant="bodyMd"
              style={[styles.cardMessage, { color: colors.onSurfaceVariant }]}
            >
              {message ||
                'This feature runs in the cloud and requires an active internet connection.'}
            </Text>
          </View>
        </View>

        {onRetry && (
          <TouchableOpacity
            style={styles.cardRetryBtn}
            onPress={handleRetry}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={styles.btnContentRow}>
                <MaterialIcons name="refresh" size={16} color={colors.primary} />
                <Text style={[styles.cardRetryText, { color: colors.primary }]}>
                  {retryText || 'Try Again'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Fullscreen variant
  return (
    <View style={[styles.fullscreenContainer, style]}>
      <View style={styles.fullscreenIconWrapper}>
        <MaterialIcons name={icon} size={44} color={colors.primary} />
      </View>

      <Text style={[styles.fullscreenTitle, { color: colors.onBackground }]}>
        {title || 'No Internet Connection'}
      </Text>

      <Text style={[styles.fullscreenMessage, { color: colors.secondary }]}>
        {message ||
          'Clarity AI is powered by cloud intelligence models and requires an active internet connection to respond. Please check your network and try again.'}
      </Text>

      {onRetry && (
        <TouchableOpacity
          style={styles.fullscreenRetryBtn}
          onPress={handleRetry}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <View style={styles.btnContentRow}>
              <MaterialIcons name="refresh" size={18} color={colors.onPrimary} />
              <Text style={[styles.fullscreenRetryText, { color: colors.onPrimary }]}>
                {retryText || 'Check Connection'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    // Fullscreen styles
    fullscreenContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
    },
    fullscreenIconWrapper: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    fullscreenTitle: {
      fontFamily: 'Manrope_700Bold',
      fontSize: 22,
      lineHeight: 28,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    fullscreenMessage: {
      fontFamily: 'Manrope_400Regular',
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: spacing.xl,
      maxWidth: 320,
    },
    fullscreenRetryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md - 2,
      borderRadius: radius.lg,
      minWidth: 160,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullscreenRetryText: {
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 15,
      lineHeight: 20,
    },

    // Card styles
    cardContainer: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.xl,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      marginVertical: spacing.xs,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    cardIconWrapper: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTextCol: {
      flex: 1,
    },
    cardTitle: {
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 15,
      lineHeight: 20,
      marginBottom: spacing.xs,
    },
    cardMessage: {
      fontFamily: 'Manrope_400Regular',
      fontSize: 13,
      lineHeight: 18,
    },
    cardRetryBtn: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: 'transparent',
    },
    cardRetryText: {
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 13,
      lineHeight: 18,
    },

    // Banner styles
    bannerContainer: {
      backgroundColor: colors.errorContainer,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    bannerContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    bannerText: {
      fontFamily: 'Manrope_500Medium',
      fontSize: 13,
      lineHeight: 18,
      flex: 1,
    },
    bannerActionBtn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    bannerActionText: {
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      lineHeight: 18,
      textDecorationLine: 'underline',
    },

    btnContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
  });
  return styles;
};
