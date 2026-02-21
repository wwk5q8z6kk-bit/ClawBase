import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;

const ConnectionBanner = React.memo(function ConnectionBanner() {
  const { gatewayStatus, activeConnection, connectGateway } = useApp();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const shouldShow =
    activeConnection &&
    gatewayStatus !== 'connected' &&
    gatewayStatus !== 'connecting' &&
    gatewayStatus !== 'authenticating' &&
    gatewayStatus !== 'pairing';

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : -80,
      useNativeDriver: Platform.OS !== 'web',
      friction: 8,
      tension: 40,
    }).start();
  }, [shouldShow, slideAnim]);

  useEffect(() => {
    if (!shouldShow) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [shouldShow, pulseAnim]);

  const handleReconnect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeConnection) {
      connectGateway(activeConnection.url, activeConnection.token || '');
    }
  };

  const handleSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/settings');
  };

  const isError = gatewayStatus === 'error';
  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + webTopPad,
          transform: [{ translateY: slideAnim }],
          pointerEvents: shouldShow ? 'auto' : 'none',
        },
      ]}
    >
      <LinearGradient
        colors={isError ? ['#3A1515', '#2A1010'] : ['#2A2010', '#201810']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <Animated.View style={{ opacity: pulseAnim }}>
          <View style={[styles.statusDot, { backgroundColor: isError ? C.error : C.amber }]} />
        </Animated.View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {isError ? 'Connection Error' : 'Gateway Disconnected'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {isError
              ? 'Check your gateway URL and try again'
              : 'Tap reconnect to restore connection'}
          </Text>
        </View>
        <Pressable
          onPress={handleReconnect}
          style={({ pressed }) => [styles.reconnectBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="refresh" size={16} color={C.secondary} />
        </Pressable>
        <Pressable
          onPress={handleSettings}
          style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="settings-outline" size={16} color={C.textSecondary} />
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: C.amber + '30',
    ...C.shadow.card,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.text,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
  },
  reconnectBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.secondaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ConnectionBanner;
