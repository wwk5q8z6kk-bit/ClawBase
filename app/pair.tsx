import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  Platform,
  Animated,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;
const { width: SCREEN_W } = Dimensions.get('window');

type PairMethod = 'qr' | 'code' | 'manual';
type ConnectPhase = 'idle' | 'testing' | 'success' | 'unreachable';

function buildHttpUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url.startsWith('http') && !url.startsWith('ws')) {
    url = 'https://' + url;
  }
  url = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
  return url.replace(/\/$/, '');
}

function buildWsUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url.startsWith('http') && !url.startsWith('ws')) {
    url = 'wss://' + url;
  }
  url = url.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  const hasPort = /:\d+(\/|$)/.test(url.replace(/^wss?:\/\//, ''));
  if (!hasPort) url += ':18789';
  return url.replace(/\/$/, '');
}

async function testReachability(rawUrl: string): Promise<{ reachable: boolean; info?: any; error?: string }> {
  try {
    const httpUrl = buildHttpUrl(rawUrl);
    const hasPort = /:\d+(\/|$)/.test(httpUrl.replace(/^https?:\/\//, ''));
    const healthUrl = hasPort ? `${httpUrl}/healthz` : `${httpUrl}:18789/healthz`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (resp.ok) {
      const info = await resp.json().catch(() => null);
      return { reachable: true, info };
    }
    return { reachable: false, error: `Gateway returned status ${resp.status}` };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { reachable: false, error: 'Connection timed out — gateway may not be reachable from this network' };
    }
    return { reachable: false, error: "Cannot reach gateway — check the address and make sure it's accessible" };
  }
}

export default function PairScreen() {
  const insets = useSafeAreaInsets();
  const { addConnection, setHasOnboarded } = useApp();
  const params = useLocalSearchParams<{ from?: string }>();
  const [method, setMethod] = useState<PairMethod | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualName, setManualName] = useState('');
  const [connectPhase, setConnectPhase] = useState<ConnectPhase>('idle');
  const [pendingConnection, setPendingConnection] = useState<{ name: string; url: string; token?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(0.5)).current;

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, [pulseAnim]);

  const saveAndFinish = useCallback(async (name: string, url: string, token?: string) => {
    try {
      const wsUrl = buildWsUrl(url);
      await addConnection(name, wsUrl, token || undefined);
      await setHasOnboarded(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConnectPhase('success');
      setPendingConnection({ name, url: wsUrl, token });
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 1200);
    } catch (e: any) {
      setError(e?.message || 'Failed to save connection');
      setConnectPhase('idle');
    }
  }, [addConnection, setHasOnboarded]);

  const finishPairing = useCallback(async (name: string, url: string, token?: string) => {
    setError(null);
    setConnectPhase('testing');
    setPendingConnection({ name, url, token });

    const result = await testReachability(url);

    if (result.reachable) {
      const gwName = result.info?.name || result.info?.agentName || name;
      await saveAndFinish(gwName, url, token);
    } else {
      setConnectPhase('unreachable');
      setError(result.error || 'Cannot reach gateway');
    }
  }, [saveAndFinish]);

  const handleQRScanned = useCallback(({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      if (data.startsWith('clawbase://') || data.startsWith('openclaw://')) {
        const url = new URL(data);
        const gwUrl = url.searchParams.get('url') || url.searchParams.get('gateway') || '';
        const token = url.searchParams.get('token') || '';
        const name = url.searchParams.get('name') || 'OpenClaw Gateway';
        if (gwUrl) {
          finishPairing(name, gwUrl, token);
          return;
        }
      }

      let parsed: any;
      try { parsed = JSON.parse(data); } catch {}

      if (parsed?.url) {
        finishPairing(parsed.name || 'OpenClaw Gateway', parsed.url, parsed.token);
        return;
      }

      if (data.match(/^(https?:\/\/|wss?:\/\/|[\d.]+[:\d]*)/)) {
        finishPairing('OpenClaw Gateway', data);
        return;
      }

      setError('Unrecognized QR code');
      setTimeout(() => setScanned(false), 2500);
    } catch {
      setError('Could not read QR code');
      setTimeout(() => setScanned(false), 2500);
    }
  }, [scanned, finishPairing]);

  const handleCodeLookup = useCallback(async () => {
    const code = pairCode.trim().toUpperCase();
    const baseUrl = gatewayBaseUrl.trim();
    if (code.length < 4 || !baseUrl) return;
    setLookingUp(true);
    setError(null);
    try {
      const httpBase = buildHttpUrl(baseUrl);
      const hasPort = /:\d+(\/|$)/.test(httpBase.replace(/^https?:\/\//, ''));
      const apiUrl = hasPort ? `${httpBase}/api/pair/${code}` : `${httpBase}:18789/api/pair/${code}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setError(err.error || err.message || 'Invalid or expired pairing code');
        setLookingUp(false);
        return;
      }
      const data = await resp.json();
      const gwUrl = data.url || baseUrl;
      const token = data.token || '';
      const name = data.name || data.agentName || 'OpenClaw Gateway';
      setLookingUp(false);
      await finishPairing(name, gwUrl, token);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setError('Timed out trying to reach your gateway');
      } else {
        setError('Cannot reach gateway — check the address');
      }
      setLookingUp(false);
    }
  }, [pairCode, gatewayBaseUrl, finishPairing]);

  const handleManualConnect = useCallback(async () => {
    if (!manualUrl.trim()) return;
    await finishPairing(manualName.trim() || 'My Gateway', manualUrl.trim(), manualToken.trim() || undefined);
  }, [manualUrl, manualToken, manualName, finishPairing]);

  const goBack = useCallback(() => {
    if (connectPhase !== 'idle' && connectPhase !== 'success') {
      setConnectPhase('idle');
      setError(null);
      setPendingConnection(null);
      return;
    }
    if (method) {
      setMethod(null);
      setError(null);
      setScanned(false);
      setConnectPhase('idle');
      setPendingConnection(null);
    } else if (params.from === 'settings') {
      router.back();
    } else {
      router.replace('/onboarding');
    }
  }, [method, params.from, connectPhase]);

  if (connectPhase === 'testing') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.phaseContent}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.phaseTitle}>Testing connection...</Text>
          <Text style={styles.phaseSub}>{pendingConnection?.url || ''}</Text>
        </View>
      </View>
    );
  }

  if (connectPhase === 'success') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.phaseContent}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <LinearGradient colors={[C.success, '#00B88A']} style={styles.successIcon}>
              <Ionicons name="checkmark" size={48} color="#FFF" />
            </LinearGradient>
          </Animated.View>
          <Text style={[styles.phaseTitle, { color: C.success }]}>Connected!</Text>
          <Text style={styles.phaseSub}>{pendingConnection?.name}</Text>
          <Text style={styles.phaseUrl}>{pendingConnection?.url}</Text>
        </View>
      </View>
    );
  }

  if (connectPhase === 'unreachable') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={C.text} />
          </Pressable>
          <Text style={styles.topBarTitle}>Connection Issue</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={styles.phaseContent}>
          <View style={styles.unreachableIcon}>
            <Ionicons name="cloud-offline" size={48} color={C.error} />
          </View>
          <Text style={styles.phaseTitle}>Can't reach your gateway</Text>
          <Text style={[styles.phaseSub, { paddingHorizontal: 24 }]}>{error}</Text>
          <Text style={[styles.phaseUrl, { marginTop: 4 }]}>{pendingConnection?.url}</Text>

          <View style={styles.unreachableTips}>
            <Text style={styles.tipHeader}>Things to check:</Text>
            <View style={styles.tipRow}>
              <Ionicons name="wifi" size={14} color={C.textSecondary} />
              <Text style={styles.tipText}>Is the gateway running?</Text>
            </View>
            <View style={styles.tipRow}>
              <Ionicons name="globe-outline" size={14} color={C.textSecondary} />
              <Text style={styles.tipText}>Is it exposed via tunnel (Cloudflare, Tailscale)?</Text>
            </View>
            <View style={styles.tipRow}>
              <Ionicons name="phone-portrait-outline" size={14} color={C.textSecondary} />
              <Text style={styles.tipText}>Are you on the same network as the gateway?</Text>
            </View>
          </View>

          <View style={styles.unreachableActions}>
            <Pressable
              onPress={() => {
                if (pendingConnection) finishPairing(pendingConnection.name, pendingConnection.url, pendingConnection.token);
              }}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="refresh" size={18} color={C.accent} />
              <Text style={[styles.retryBtnText, { color: C.accent }]}>Try again</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (pendingConnection) saveAndFinish(pendingConnection.name, pendingConnection.url, pendingConnection.token);
              }}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.saveAnywayText}>Save anyway for later</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (method === 'qr') {
    if (Platform.OS === 'web') {
      return (
        <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
          <View style={styles.topBar}>
            <Pressable onPress={goBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={28} color={C.text} />
            </Pressable>
            <Text style={styles.topBarTitle}>Scan QR Code</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.webCameraFallback}>
            <View style={styles.fallbackIconWrap}>
              <Ionicons name="camera-outline" size={48} color={C.textTertiary} />
            </View>
            <Text style={styles.fallbackTitle}>Camera not available on web</Text>
            <Text style={styles.fallbackSub}>Use ClawBase on your phone to scan QR codes, or try manual setup.</Text>
            <Pressable onPress={() => setMethod('manual')} style={({ pressed }) => [styles.fallbackBtn, pressed && { opacity: 0.8 }]}>
              <Ionicons name="code-slash-outline" size={18} color={C.secondary} />
              <Text style={[styles.fallbackBtnText, { color: C.secondary }]}>Manual Setup</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (!cameraPermission?.granted) {
      return (
        <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
          <View style={styles.topBar}>
            <Pressable onPress={goBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={28} color={C.text} />
            </Pressable>
            <Text style={styles.topBarTitle}>Scan QR Code</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.permissionContent}>
            <View style={styles.permissionIconWrap}>
              <Ionicons name="camera" size={40} color={C.accent} />
            </View>
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionSub}>We need camera access to scan your gateway's QR code.</Text>
            <Pressable
              onPress={requestCameraPermission}
              style={({ pressed }) => [styles.permissionBtn, pressed && { opacity: 0.8 }]}
            >
              <LinearGradient colors={[C.primary, '#D43D3D']} style={styles.permissionBtnInner}>
                <Text style={styles.permissionBtnText}>Allow Camera</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#000' }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleQRScanned}
        />
        <View style={styles.scanOverlay}>
          <View style={[styles.topBar, { backgroundColor: 'transparent' }]}>
            <Pressable onPress={goBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </Pressable>
            <Text style={[styles.topBarTitle, { color: '#FFF' }]}>Scan QR Code</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={styles.scanFrameContainer}>
            <View style={styles.scanFrame}>
              <View style={[styles.scanCorner, styles.scanCornerTL]} />
              <View style={[styles.scanCorner, styles.scanCornerTR]} />
              <View style={[styles.scanCorner, styles.scanCornerBL]} />
              <View style={[styles.scanCorner, styles.scanCornerBR]} />
            </View>
          </View>

          <View style={styles.scanBottom}>
            {error && (
              <View style={styles.scanError}>
                <Ionicons name="alert-circle" size={16} color={C.error} />
                <Text style={styles.scanErrorText}>{error}</Text>
              </View>
            )}
            <Text style={styles.scanHint}>Point at the QR code on your OpenClaw gateway</Text>
          </View>
        </View>
      </View>
    );
  }

  if (method === 'code') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={C.text} />
          </Pressable>
          <Text style={styles.topBarTitle}>Pairing Code</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.codeContent} keyboardShouldPersistTaps="handled">
          <View style={styles.codeIconWrap}>
            <Ionicons name="keypad" size={36} color={C.coral} />
          </View>
          <Text style={styles.codeTitle}>Pair with your gateway</Text>
          <Text style={styles.codeSub}>Enter your gateway address and the pairing code it displays. The app connects directly to your gateway.</Text>

          <TextInput
            style={styles.manualInput}
            placeholder="Gateway address (e.g. my-server.example.com)"
            placeholderTextColor={C.textTertiary}
            value={gatewayBaseUrl}
            onChangeText={(t) => { setGatewayBaseUrl(t); setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <TextInput
            style={styles.codeInput}
            placeholder="ABC123"
            placeholderTextColor={C.textTertiary + '60'}
            value={pairCode}
            onChangeText={(t) => { setPairCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setError(null); }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />

          {error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={C.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleCodeLookup}
            disabled={pairCode.length < 4 || !gatewayBaseUrl.trim() || lookingUp}
            style={({ pressed }) => [
              styles.codeBtn,
              (pairCode.length < 4 || !gatewayBaseUrl.trim() || lookingUp) && { opacity: 0.4 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <LinearGradient colors={[C.primary, '#D43D3D']} style={styles.codeBtnInner}>
              {lookingUp ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="link" size={18} color="#FFF" />
                  <Text style={styles.codeBtnText}>Connect</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <View style={styles.codeHintRow}>
            <Ionicons name="information-circle-outline" size={14} color={C.textTertiary} />
            <Text style={styles.codeHint}>The code is generated by your gateway and expires after 10 minutes</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (method === 'manual') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={C.text} />
          </Pressable>
          <Text style={styles.topBarTitle}>Manual Setup</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.manualContent} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.manualInput}
            placeholder="Name (e.g. Home Server)"
            placeholderTextColor={C.textTertiary}
            value={manualName}
            onChangeText={setManualName}
          />
          <TextInput
            style={styles.manualInput}
            placeholder="Gateway URL (e.g. gateway.example.com)"
            placeholderTextColor={C.textTertiary}
            value={manualUrl}
            onChangeText={(t) => { setManualUrl(t); setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={styles.manualInput}
            placeholder="Auth token (optional)"
            placeholderTextColor={C.textTertiary}
            value={manualToken}
            onChangeText={setManualToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Text style={styles.helperText}>Default port is :18789 — added automatically if not specified</Text>

          {error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={C.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleManualConnect}
            disabled={!manualUrl.trim()}
            style={({ pressed }) => [
              styles.codeBtn,
              !manualUrl.trim() && { opacity: 0.4 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <LinearGradient colors={[C.primary, '#D43D3D']} style={styles.codeBtnInner}>
              <Ionicons name="flash" size={18} color="#FFF" />
              <Text style={styles.codeBtnText}>Connect</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Connect to Gateway</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.methodList}>
        <Text style={styles.methodListTitle}>Choose how to connect</Text>

        <Pressable onPress={() => { setMethod('qr'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={['#1A1520', '#151020']} style={styles.pairMethodCard}>
            <View style={[styles.pairMethodIcon, { backgroundColor: C.accent + '18' }]}>
              <Ionicons name="qr-code" size={28} color={C.accent} />
            </View>
            <View style={styles.pairMethodInfo}>
              <Text style={styles.pairMethodTitle}>Scan QR Code</Text>
              <Text style={styles.pairMethodDesc}>Scan the QR code your gateway displays. Instant setup.</Text>
            </View>
            <View style={[styles.pairMethodBadge, { backgroundColor: C.success + '18' }]}>
              <Text style={[styles.pairMethodBadgeText, { color: C.success }]}>Recommended</Text>
            </View>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => { setMethod('code'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={['#1A1815', '#151310']} style={styles.pairMethodCard}>
            <View style={[styles.pairMethodIcon, { backgroundColor: C.coral + '18' }]}>
              <Ionicons name="keypad" size={28} color={C.coral} />
            </View>
            <View style={styles.pairMethodInfo}>
              <Text style={styles.pairMethodTitle}>Pairing Code</Text>
              <Text style={styles.pairMethodDesc}>Enter your gateway address and the code it shows.</Text>
            </View>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => { setMethod('manual'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={['#151A1A', '#101515']} style={styles.pairMethodCard}>
            <View style={[styles.pairMethodIcon, { backgroundColor: C.secondary + '18' }]}>
              <Ionicons name="code-slash" size={28} color={C.secondary} />
            </View>
            <View style={styles.pairMethodInfo}>
              <Text style={styles.pairMethodTitle}>Manual Setup</Text>
              <Text style={styles.pairMethodDesc}>Enter URL and token directly. For advanced users.</Text>
            </View>
          </LinearGradient>
        </Pressable>

        <View style={styles.deepLinkHint}>
          <Ionicons name="link-outline" size={14} color={C.textTertiary} />
          <Text style={styles.deepLinkHintText}>
            You can also tap a clawbase:// link from your gateway to connect automatically.
          </Text>
        </View>
      </View>
    </View>
  );
}

const SCAN_SIZE = SCREEN_W * 0.65;

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  topBarTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: C.text },
  phaseContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32, paddingBottom: 40 },
  phaseTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, color: C.text },
  phaseSub: { fontFamily: 'Inter_500Medium', fontSize: 15, color: C.textSecondary, textAlign: 'center' },
  phaseUrl: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  unreachableIcon: { width: 88, height: 88, borderRadius: 28, backgroundColor: C.error + '15', alignItems: 'center', justifyContent: 'center' },
  unreachableTips: { marginTop: 20, gap: 10, width: '100%', backgroundColor: C.card, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.border },
  tipHeader: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text, marginBottom: 4 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textSecondary },
  unreachableActions: { marginTop: 20, gap: 16, alignItems: 'center', width: '100%' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, backgroundColor: C.accent + '15', borderWidth: 1, borderColor: C.accent + '30', width: '100%', justifyContent: 'center' },
  retryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  saveAnywayText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.textTertiary, textDecorationLine: 'underline' },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  scanFrameContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: SCAN_SIZE, height: SCAN_SIZE, position: 'relative' },
  scanCorner: { position: 'absolute', width: 24, height: 24, borderColor: C.accent, borderWidth: 3 },
  scanCornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  scanCornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  scanCornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  scanCornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  scanBottom: { padding: 24, alignItems: 'center', gap: 12 },
  scanHint: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#FFF', textAlign: 'center', opacity: 0.8 },
  scanError: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.error + '30', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  scanErrorText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.error },
  permissionContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  permissionIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.accentMuted, alignItems: 'center', justifyContent: 'center' },
  permissionTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: C.text },
  permissionSub: { fontFamily: 'Inter_400Regular', fontSize: 15, color: C.textSecondary, textAlign: 'center', lineHeight: 22 },
  permissionBtn: { borderRadius: 14, overflow: 'hidden', width: '80%', marginTop: 8 },
  permissionBtnInner: { paddingVertical: 16, alignItems: 'center' },
  permissionBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFF' },
  webCameraFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  fallbackIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  fallbackTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: C.text },
  fallbackSub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  fallbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: C.secondary + '15', borderWidth: 1, borderColor: C.secondary + '30' },
  fallbackBtnText: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  codeContent: { paddingHorizontal: 24, paddingTop: 30, alignItems: 'center', gap: 14, paddingBottom: 40 },
  codeIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.coral + '15', alignItems: 'center', justifyContent: 'center' },
  codeTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: C.text },
  codeSub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  codeInput: { fontFamily: 'Inter_700Bold', fontSize: 32, color: C.text, textAlign: 'center', letterSpacing: 8, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingVertical: 20, paddingHorizontal: 24, width: '100%' },
  codeBtn: { borderRadius: 14, overflow: 'hidden', width: '100%' },
  codeBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  codeBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFF' },
  codeHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 8 },
  codeHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary, flex: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.error + '10', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, width: '100%' },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.error, flex: 1 },
  manualContent: { paddingHorizontal: 24, paddingTop: 24, gap: 14, paddingBottom: 40 },
  manualInput: { backgroundColor: C.card, borderRadius: 12, padding: 14, fontFamily: 'Inter_400Regular', fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border, width: '100%' },
  helperText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary, alignSelf: 'flex-start', marginTop: -6 },
  methodList: { flex: 1, paddingHorizontal: 20, paddingTop: 24, gap: 14 },
  methodListTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.textSecondary, marginBottom: 4 },
  pairMethodCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: C.borderLight },
  pairMethodIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pairMethodInfo: { flex: 1, gap: 4 },
  pairMethodTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: C.text },
  pairMethodDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  pairMethodBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pairMethodBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  deepLinkHint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, marginTop: 12 },
  deepLinkHintText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary, flex: 1, lineHeight: 17 },
});
