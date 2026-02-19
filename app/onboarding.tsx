import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;
const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { addConnection, setHasOnboarded } = useApp();
  const [step, setStep] = useState(0);
  const [gatewayName, setGatewayName] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState('');

  const handleSkip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setHasOnboarded(true);
    router.replace('/(tabs)');
  }, [setHasOnboarded]);

  const handleConnect = useCallback(async () => {
    if (!gatewayUrl.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    let url = gatewayUrl.trim();
    if (!url.startsWith('http') && !url.startsWith('ws')) {
      url = 'wss://' + url;
    }
    await addConnection(gatewayName.trim() || 'My Gateway', url);
    await setHasOnboarded(true);
    router.replace('/(tabs)');
  }, [gatewayName, gatewayUrl, addConnection, setHasOnboarded]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  if (step === 0) {
    return (
      <LinearGradient
        colors={['#0F1528', C.background]}
        style={[styles.container, { paddingTop: insets.top + webTopPad }]}
      >
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <LinearGradient
              colors={[C.primary, '#E63E3E']}
              style={styles.iconGradient}
            >
              <Ionicons name="sparkles" size={40} color="#FFF" />
            </LinearGradient>
          </View>
          <Text style={styles.title}>ClawCockpit</Text>
          <Text style={styles.tagline}>
            The mission control your self-hosted agent deserves
          </Text>

          <View style={styles.featureList}>
            {[
              { icon: 'chatbubbles-outline', text: 'Rich real-time agent chat' },
              { icon: 'checkbox-outline', text: 'Visual Kanban task boards' },
              { icon: 'search-outline', text: 'Searchable memory browser' },
              { icon: 'shield-checkmark-outline', text: '100% private & local' },
            ].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name={f.icon as any} size={20} color={C.secondary} />
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.bottomActions, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 20 }]}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setStep(1);
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <LinearGradient
              colors={[C.primary, '#D43D3D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              <Text style={styles.btnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </LinearGradient>
          </Pressable>
          <Pressable onPress={handleSkip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => setStep(0)}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Connect Gateway</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.stepContent}>
        <View style={styles.stepIconWrap}>
          <Ionicons name="server-outline" size={32} color={C.accent} />
        </View>
        <Text style={styles.stepDesc}>
          Enter your OpenClaw Gateway address to connect. You can also add it later from Settings.
        </Text>

        <TextInput
          style={styles.stepInput}
          placeholder="Name (e.g. Home Server)"
          placeholderTextColor={C.textTertiary}
          value={gatewayName}
          onChangeText={setGatewayName}
        />
        <TextInput
          style={styles.stepInput}
          placeholder="Gateway URL or IP"
          placeholderTextColor={C.textTertiary}
          value={gatewayUrl}
          onChangeText={setGatewayUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <View style={styles.protocols}>
          {['Local IP', 'Tailscale', 'Cloudflare'].map((p) => (
            <View key={p} style={styles.protocolChip}>
              <Ionicons name="checkmark-circle" size={14} color={C.success} />
              <Text style={styles.protocolText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.bottomActions, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 20 }]}>
        <Pressable
          onPress={handleConnect}
          style={({ pressed }) => [
            styles.primaryBtn,
            !gatewayUrl.trim() && { opacity: 0.4 },
            pressed && { opacity: 0.9 },
          ]}
          disabled={!gatewayUrl.trim()}
        >
          <LinearGradient
            colors={[C.primary, '#D43D3D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btnGradient}
          >
            <Ionicons name="link-outline" size={20} color="#FFF" />
            <Text style={styles.btnText}>Connect</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={handleSkip}>
          <Text style={styles.skipText}>Set up later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconWrap: {
    marginBottom: 8,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: C.text,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  featureList: {
    marginTop: 24,
    gap: 16,
    alignSelf: 'stretch',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: C.text,
  },
  bottomActions: {
    paddingHorizontal: 24,
    gap: 16,
    alignItems: 'center',
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%',
  },
  btnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  btnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: '#FFF',
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: C.textSecondary,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stepTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: C.text,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16,
    alignItems: 'center',
  },
  stepIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: C.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  stepInput: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
    width: '100%',
  },
  protocols: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  protocolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.successMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  protocolText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.success,
  },
});
