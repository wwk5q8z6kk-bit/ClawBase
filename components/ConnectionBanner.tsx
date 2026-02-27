import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const [dismissed, setDismissed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const shouldShow =
    !dismissed &&
    activeConnection &&
    gatewayStatus !== 'connected' &&
    gatewayStatus !== 'connecting' &&
    gatewayStatus !== 'authenticating' &&
    gatewayStatus !== 'pairing';

  useEffect(() => {
    if (gatewayStatus === 'connected') {
      setDismissed(false);
      setReconnecting(false);
    }
  }, [gatewayStatus]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : -80,
      useNativeDriver: Platform.OS !== 'web',
      friction: 8,
      tension: 40,
    }).start();
  }, [shouldShow, slideAnim]);

  const handleReconnect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeConnection) {
      setReconnecting(true);
      connectGateway(activeConnection.url, activeConnection.token || '');
    }
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissed(true);
  };

  const webTopPad = Platform.OS === 'web' ? 47 : 0;

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
      <View style={styles.banner}>
        <View style={[styles.statusDot, { backgroundColor: gatewayStatus === 'error' ? C.error : C.amber }]} />
        <Text style={styles.title} numberOfLines={1}>
          {gatewayStatus === 'error' ? 'Connection error' : 'Gateway offline'}
        </Text>
        <Pressable
          onPress={handleReconnect}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
          disabled={reconnecting}
        >
          <Ionicons name={reconnecting ? 'hourglass' : 'refresh'} size={14} color={C.text} />
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/settings'); }}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="settings-outline" size={14} color={C.textSecondary} />
        </Pressable>
        <Pressable
          onPress={handleDismiss}
          style={({ pressed }) => [styles.dismissBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="close" size={14} color={C.textTertiary} />
        </Pressable>
      </View>
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.textSecondary,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ConnectionBanner;
