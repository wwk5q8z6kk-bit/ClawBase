import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  Platform,
  Dimensions,
  Animated,
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
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const glowAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.7, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const connectionMethods = [
    { id: 'local', label: 'Local Network', icon: 'wifi' as const, color: '#FFB020', subtitle: 'Same Wi-Fi network', prefill: '192.168.1.x:18789' },
    { id: 'tailscale', label: 'Tailscale VPN', icon: 'shield-checkmark' as const, color: '#00D4AA', subtitle: 'Secure mesh VPN', prefill: 'your-host.ts.net:18789' },
    { id: 'cloudflare', label: 'Cloudflare Tunnel', icon: 'cloud' as const, color: '#5B7FFF', subtitle: 'Access from anywhere', prefill: 'gateway.yourdomain.com' },
  ];

  const handleMethodSelect = useCallback((method: typeof connectionMethods[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMethod(method.id);
    setGatewayUrl(method.prefill);
  }, []);

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
            <Animated.View style={[styles.glowCircle, { opacity: glowAnim }]} />
            <LinearGradient
              colors={[C.primary, '#E63E3E']}
              style={styles.iconGradient}
            >
              <Ionicons name="sparkles" size={40} color="#FFF" />
            </LinearGradient>
          </View>
          <Text style={styles.title}>ClawBase</Text>
          <Text style={styles.tagline}>
            The mission control your self-hosted agent deserves
          </Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v2.0</Text>
          </View>

          <View style={styles.featureList}>
            {[
              { icon: 'chatbubbles-outline', text: 'Rich real-time agent chat' },
              { icon: 'checkbox-outline', text: 'Visual Kanban task boards' },
              { icon: 'search-outline', text: 'Searchable memory browser' },
              { icon: 'shield-checkmark-outline', text: '100% private & local' },
              { icon: 'calendar-outline', text: 'Native calendar with agenda views' },
              { icon: 'people-outline', text: 'CRM contacts & pipeline tracking' },
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
          Connect to your OpenClaw gateway instantly, or set up manually.
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/pair'); }}
            style={({ pressed }) => [{ flex: 1, borderRadius: 14, overflow: 'hidden' }, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[C.accent + '20', C.accent + '08']} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.accent + '30' }}>
              <Ionicons name="qr-code" size={18} color={C.accent} />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.accent }}>Scan QR</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/pair'); }}
            style={({ pressed }) => [{ flex: 1, borderRadius: 14, overflow: 'hidden' }, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[C.coral + '20', C.coral + '08']} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.coral + '30' }}>
              <Ionicons name="keypad" size={18} color={C.coral} />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.coral }}>Pair Code</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', paddingHorizontal: 8 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textTertiary }}>or connect manually</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
        </View>

        <View style={styles.methodCardsRow}>
          {connectionMethods.map((method) => {
            const isSelected = selectedMethod === method.id;
            return (
              <Pressable
                key={method.id}
                onPress={() => handleMethodSelect(method)}
                style={[
                  styles.methodCard,
                  isSelected && { borderColor: method.color, borderWidth: 1.5 },
                ]}
              >
                <LinearGradient
                  colors={isSelected ? [`${method.color}20`, `${method.color}08`] : [C.card, C.surface]}
                  style={styles.methodCardInner}
                >
                  <View style={[styles.methodIconWrap, { backgroundColor: `${method.color}20` }]}>
                    <Ionicons name={method.icon} size={20} color={method.color} />
                  </View>
                  <Text style={[styles.methodLabel, isSelected && { color: method.color }]}>{method.label}</Text>
                  <Text style={styles.methodSubtitle}>{method.subtitle}</Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>

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
          onChangeText={(text) => {
            setGatewayUrl(text);
            if (selectedMethod) {
              const m = connectionMethods.find(cm => cm.id === selectedMethod);
              if (m && text !== m.prefill) setSelectedMethod(null);
            }
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.helperText}>Default port is :18789 for OpenClaw Gateway</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowCircle: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: C.primary,
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
  methodCardsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  methodCard: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  methodCardInner: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    gap: 6,
  },
  methodIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: C.text,
    textAlign: 'center',
  },
  methodSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: C.textTertiary,
    textAlign: 'center',
  },
  helperText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    alignSelf: 'flex-start',
    marginTop: -8,
  },
  versionBadge: {
    backgroundColor: C.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  versionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: C.primary,
  },
});
