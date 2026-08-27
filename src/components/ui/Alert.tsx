import { ThemeColors, typography, useTheme } from '@/theme';
import React, { createContext, useCallback, useContext, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './Text';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

interface AlertContextType {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlert must be used within an AlertProvider');
  return context;
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  const hideAlert = useCallback(() => {
    opacity.value = withTiming(0, { duration: 150 });
    scale.value = withTiming(0.9, { duration: 150 }, () => {
      runOnJS(setIsVisible)(false);
      runOnJS(setAlertState)(null);
    });
  }, [opacity, scale]);

  const showAlert = useCallback(
    (title: string, message?: string, buttons?: AlertButton[]) => {
      // Default to a single "OK" button if none provided
      const finalButtons =
        buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' as const }];
      setAlertState({ title, message, buttons: finalButtons });
      setIsVisible(true);

      opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
      scale.value = withSpring(1, { damping: 20, stiffness: 200 });
    },
    [opacity, scale]
  );

  const handleButtonPress = (btn: AlertButton) => {
    hideAlert();
    // Use setTimeout to ensure the modal starts closing before executing the callback
    if (btn.onPress) {
      setTimeout(() => {
        btn.onPress!();
      }, 50);
    }
  };

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const buttons = alertState?.buttons || [];

  // Decide layout: if exactly 2 buttons, side-by-side. Otherwise stacked.
  const isStacked = buttons.length !== 2;

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}

      <Modal visible={isVisible} transparent animationType="none" onRequestClose={hideAlert}>
        <TouchableWithoutFeedback onPress={hideAlert}>
          <Animated.View style={[styles.overlay, overlayStyle]}>
            <TouchableWithoutFeedback>
              <Animated.View style={[styles.card, cardStyle]}>
                {alertState?.title && <Text style={styles.title}>{alertState.title}</Text>}

                {alertState?.message && <Text style={styles.message}>{alertState.message}</Text>}

                <View
                  style={[
                    styles.buttonContainer,
                    isStacked ? styles.stackedButtons : styles.rowButtons,
                  ]}
                >
                  {buttons.map((btn, index) => {
                    const isDestructive = btn.style === 'destructive';
                    const isCancel = btn.style === 'cancel';
                    const isDefault = !isDestructive && !isCancel;

                    return (
                      <TouchableOpacity
                        key={index}
                        onPress={() => handleButtonPress(btn)}
                        style={[
                          styles.button,
                          isStacked && styles.stackedButton,
                          !isStacked && styles.rowButton,
                          isDestructive && styles.destructiveButton,
                          isCancel && styles.cancelButton,
                          isDefault && styles.defaultButton,
                        ]}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            isDestructive && styles.destructiveText,
                            isCancel && styles.cancelText,
                            isDefault && styles.defaultText,
                          ]}
                        >
                          Ok
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
    </AlertContext.Provider>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    overlay: {
      ...(StyleSheet.absoluteFill as any),
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 24,
      width: '100%',
      maxWidth: 400,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 10,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      textAlign: 'center',
      marginBottom: 8,
    },
    message: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: 24,
    },
    buttonContainer: {
      gap: 12,
    },
    stackedButtons: {
      flexDirection: 'column',
    },
    rowButtons: {
      flexDirection: 'row',
    },
    button: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stackedButton: {
      width: '100%',
    },
    rowButton: {
      flex: 1,
    },
    buttonText: {
      textAlign: 'center',
    },
    defaultButton: {
      backgroundColor: colors.primary,
    },
    defaultText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
    cancelButton: {
      backgroundColor: colors.surfaceContainer,
    },
    cancelText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
    destructiveButton: {
      backgroundColor: colors.errorContainer,
    },
    destructiveText: {
      ...typography.labelMd,
      color: colors.onErrorContainer,
    },
  });
  return styles;
};
