import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Text } from './Text';

export type ToastType = 'success' | 'error' | 'info';

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
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
  const [toast, setToast] = useState<{ id: string; message: string; type: ToastType } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    
    setToast({ id: Math.random().toString(), message, type });
    
    timerRef.current = setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  const hideToast = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  };

  const getBackgroundColor = (type: ToastType) => {
    switch (type) {
      case 'success': return colors.primary;
      case 'error': return colors.error;
      case 'info': default: return colors.secondary;
    }
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return 'check-circle';
      case 'error': return 'error';
      case 'info': default: return 'info';
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
          <TouchableOpacity 
            activeOpacity={0.9} 
            onPress={hideToast}
            style={[styles.toastContent, { backgroundColor: getBackgroundColor(toast.type) }]}
          >
            <MaterialIcons name={getIcon(toast.type)} size={20} color={colors.onPrimary} />
            <Text style={styles.toastText}>{toast.message}</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    minWidth: 200,
    maxWidth: '100%',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
});
