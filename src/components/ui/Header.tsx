import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Text } from './Text';
import { typography, useTheme } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export interface HeaderProps {
  title?: string;
  showBack?: boolean;
  leftNode?: React.ReactNode;
  rightNode?: React.ReactNode;
  onBack?: () => void;
  style?: ViewStyle;
  transparent?: boolean;
  isMainTab?: boolean;
}

export function Header({
  title,
  showBack = false,
  leftNode,
  rightNode,
  onBack,
  style,
  transparent = false,
  isMainTab = false,
}: HeaderProps) {
  const { colors } = useTheme();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.push('/(app)/(tabs)');
      }
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          borderBottomWidth: transparent || isMainTab ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: transparent ? 'transparent' : colors.surfaceVariant,
        },
        style,
      ]}
    >
      {/* Left Action */}
      <View style={styles.leftContainer}>
        {leftNode ? (
          leftNode
        ) : showBack ? (
          <TouchableOpacity style={styles.iconButton} onPress={handleBack}>
            <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {/* Title */}
      <View style={styles.titleContainer} pointerEvents="none">
        {title ? (
          <Text
            style={[
              styles.title,
              isMainTab ? typography.headlineMd : typography.headlineSm,
              { color: colors.onSurface },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        ) : null}
      </View>

      {/* Right Action */}
      <View style={styles.rightContainer}>
        {rightNode ? rightNode : <View style={styles.placeholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 64, // consistent touch target height
    backgroundColor: 'transparent',
    zIndex: 40, // high zIndex for all headers
  },
  leftContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  rightContainer: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 2,
  },
  titleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  title: {
    textAlign: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    marginLeft: -8, // Adjust to make icon visually align with 16px padding
  },
  placeholder: {
    width: 44,
    height: 44,
  },
});
