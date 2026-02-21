import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

const C = Colors.dark;

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_CONFIG: Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  success: { icon: 'checkmark-circle', color: C.success, bg: '#0A2020' },
  error: { icon: 'alert-circle', color: C.error, bg: '#2A1010' },
  info: { icon: 'information-circle', color: C.accent, bg: '#101830' },
  warning: { icon: 'warning', color: C.amber, bg: '#2A1E10' },
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const config = TOAST_CONFIG[toast.type];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: Platform.OS !== 'web', friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -60, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
      ]).start(() => onDismiss(toast.id));
    }, toast.duration || 2500);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, translateY, opacity, onDismiss]);

  return (
    <Animated.View style={[styles.toast, { backgroundColor: config.bg, borderColor: config.color + '30', transform: [{ translateY }], opacity }]}>
      <Ionicons name={config.icon} size={18} color={config.color} />
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counterRef = useRef(0);

  const showToast = useCallback((type: ToastType, message: string, duration?: number) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev.slice(-2), { id, type, message, duration }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={[styles.container, { top: insets.top + webTopPad + 8, pointerEvents: 'none' }]}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 10000,
    gap: 8,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
    maxWidth: 400,
    ...C.shadow.elevated,
  },
  toastText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
    flex: 1,
    lineHeight: 18,
  },
});
