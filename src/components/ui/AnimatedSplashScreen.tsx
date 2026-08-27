import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/useTheme';

const SplashIcon = require('../../../assets/images/splash-icon.png');

interface AnimatedSplashScreenProps {
  onAnimationComplete: () => void;
}

export function AnimatedSplashScreen({ onAnimationComplete }: AnimatedSplashScreenProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    // 1. Initial short delay
    // 2. Slight scale up with spring
    scale.value = withDelay(
      300,
      withSpring(1.2, { damping: 10, stiffness: 100 })
    );

    // 3. Fade out the splash screen completely
    opacity.value = withDelay(
      800,
      withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) }, (finished) => {
        if (finished) {
          runOnJS(onAnimationComplete)();
        }
      })
    );
  }, [scale, opacity, onAnimationComplete]);

  const containerStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      backgroundColor: colors.background,
    };
  });

  const logoStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, containerStyle, styles.container]}>
      <Animated.Image source={SplashIcon} style={[styles.image, logoStyle]} resizeMode="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999, // Ensure it stays on top during animation
  },
  image: {
    width: 76,
    height: 76,
  },
});
