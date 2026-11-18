import { useTheme } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { Text } from './Text';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export type ToastType = 'success' | 'error' | 'info';

interface ToastContextType {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{
    id: string;
    message: string;
    type: ToastType;
    action?: ToastAction;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = useTheme();
  const insets = useSafeInsets();

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', action?: ToastAction) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      setToast({ id: Math.random().toString(), message, type, action });

      const duration = action ? 4500 : 3000;
      timerRef.current = setTimeout(() => {
        setToast(null);
      }, duration);
    },
    []
  );

  const hideToast = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  };

  const getBackgroundColor = (type: ToastType) => {
    switch (type) {
      case 'success':
        return colors.success;
      case 'error':
        return colors.error;
      case 'info':
      default:
        return colors.inverseSurface;
    }
  };

  const getForegroundColor = (type: ToastType) => {
    switch (type) {
      case 'success':
        return colors.onSuccess;
      case 'error':
        return colors.onError;
      case 'info':
      default:
        return colors.inverseOnSurface;
    }
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'error';
      case 'info':
      default:
        return 'info';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(300)}
          exiting={FadeOutUp.duration(200)}
          style={[styles.toastContainer, { top: insets.top + 16 }]}
        >
          <View style={[styles.toastContent, { backgroundColor: getBackgroundColor(toast.type) }]}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={hideToast}
              style={styles.toastMain}
            >
              <MaterialIcons name={getIcon(toast.type)} size={20} color={getForegroundColor(toast.type)} />
              <Text style={[styles.toastText, { color: getForegroundColor(toast.type) }]}>
                {toast.message}
              </Text>
            </TouchableOpacity>

            {toast.action ? (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  {
                    backgroundColor:
                      colors.inverseSurface === getBackgroundColor(toast.type)
                        ? colors.primary
                        : 'rgba(255,255,255,0.25)',
                  },
                ]}
                onPress={() => {
                  toast.action?.onPress();
                  hideToast();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    {
                      color:
                        colors.inverseSurface === getBackgroundColor(toast.type)
                          ? colors.onPrimary
                          : '#FFFFFF',
                    },
                  ]}
                >
                  {toast.action.label}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    minWidth: 220,
    maxWidth: '100%',
  },
  toastMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
