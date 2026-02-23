import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
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
import { Typography } from '@/components/Typography';
import { useApp } from '@/lib/AppContext';
import { discoverGateways, type DiscoveredGateway } from '@/lib/discovery';
import { validateGatewayHandshake } from '@/lib/gatewayHandshake';

const C = Colors.dark;
const { width: SCREEN_W } = Dimensions.get('window');

type PairMethod = 'qr' | 'code' | 'manual' | 'tailscale';
type ConnectPhase = 'idle' | 'testing' | 'success' | 'unreachable' | 'pairing';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isLocalAddress(host: string): boolean {
  const h = host.replace(/:\d+$/, '');
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h) || h.endsWith('.local');
}

function buildHttpUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url.startsWith('http') && !url.startsWith('ws')) {
    const scheme = isLocalAddress(url) ? 'http://' : 'https://';
    url = scheme + url;
  }
  url = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
  return url.replace(/\/$/, '');
}

function buildWsUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url.startsWith('http') && !url.startsWith('ws')) {
    const scheme = isLocalAddress(url) ? 'ws://' : 'wss://';
    url = scheme + url;
  }
  url = url.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  const hasPort = /:\d+(\/|$)/.test(url.replace(/^wss?:\/\//, ''));
  if (!hasPort) url += ':18789';
  return url.replace(/\/$/, '');
}

async function testReachability(rawUrl: string, token?: string): Promise<{ reachable: boolean; info?: any; error?: string }> {
  const handshake = await validateGatewayHandshake(rawUrl, {
    token,
    timeoutMs: 6000,
  });

  if (handshake.valid && !handshake.authError) {
    return { reachable: true, info: handshake.info };
  }

  if (handshake.authError) {
    return {
      reachable: false,
      info: handshake.info,
      error: handshake.authError,
    };
  }

  return {
    reachable: false,
    error: handshake.error || "Cannot reach gateway — check the address and make sure it's accessible",
  };
}

export default function PairScreen() {
  const insets = useSafeAreaInsets();
  const { addConnection, setHasOnboarded } = useApp();
  const params = useLocalSearchParams<{
    from?: string | string[];
    url?: string | string[];
    token?: string | string[];
    name?: string | string[];
  }>();
  const fromParam = firstParam(params.from);
  const deeplinkUrl = firstParam(params.url);
  const deeplinkToken = firstParam(params.token);
  const deeplinkName = firstParam(params.name);
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
  const [discoveredGateways, setDiscoveredGateways] = useState<DiscoveredGateway[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ checked: 0, total: 0 });
  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  const autoConnectTriggered = useRef(false);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, [pulseAnim]);

  const runDiscovery = useCallback(async () => {
    setScanning(true);
    setDiscoveredGateways([]);
    setScanProgress({ checked: 0, total: 0 });
    try {
      const found = await discoverGateways({
        onProgress: (checked, total) => setScanProgress({ checked, total }),
      });
      setDiscoveredGateways(found);
    } catch { }
    setScanning(false);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' && !method) {
      runDiscovery();
    }
  }, [method, runDiscovery]);

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

    try {
      const result = await testReachability(url, token);
      if (!result.reachable) {
        setError(result.error || "Cannot reach gateway — check the address and make sure it's accessible");
        setConnectPhase('unreachable');
        return;
      }
      const gwName = result.info?.name || result.info?.agentName || name;
      await saveAndFinish(gwName, url, token);
    } catch (e: any) {
      setError(e?.message || 'Cannot reach gateway — check the address');
      setConnectPhase('unreachable');
    }
  }, [saveAndFinish]);

  useEffect(() => {
    if (autoConnectTriggered.current) return;
    if (fromParam !== 'deeplink') return;
    if (!deeplinkUrl?.trim()) return;

    autoConnectTriggered.current = true;
    const name = deeplinkName?.trim() || 'OpenClaw Gateway';
    const token = deeplinkToken?.trim() || undefined;
    void finishPairing(name, deeplinkUrl.trim(), token);
  }, [fromParam, deeplinkUrl, deeplinkToken, deeplinkName, finishPairing]);

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
      try { parsed = JSON.parse(data); } catch { }

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
    } else if (fromParam === 'settings') {
      router.back();
    } else {
      router.replace('/onboarding');
    }
  }, [method, fromParam, connectPhase]);

  if (connectPhase === 'testing') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.phaseContent}>
          <ActivityIndicator size="large" color={C.accent} />
          <Typography style={styles.phaseTitle}>Testing connection...</Typography>
          <Typography style={styles.phaseSub}>{pendingConnection?.url || ''}</Typography>
        </View>
      </View>
    );
  }

  if (connectPhase === 'pairing') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.phaseContent}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <View style={[styles.successIcon, { backgroundColor: C.coral + '20' }]}>
              <Ionicons name="finger-print" size={48} color={C.coral} />
            </View>
          </Animated.View>
          <Typography style={styles.phaseTitle}>Approve on Gateway</Typography>
          <Typography style={[styles.phaseSub, { paddingHorizontal: 24 }]}>
            Open your gateway terminal and approve this device:
          </Typography>
          <View style={styles.unreachableTips}>
            <Typography style={[styles.tipText, { fontFamily: 'Inter_500Medium', color: C.coral }]}>
              openclaw nodes pending{'\n'}openclaw nodes approve {'<requestId>'}
            </Typography>
          </View>
          <Typography style={[styles.phaseUrl, { marginTop: 8 }]}>{pendingConnection?.url}</Typography>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [{ marginTop: 20 }, pressed && { opacity: 0.7 }]}
          >
            <Typography style={styles.saveAnywayText}>Cancel</Typography>
          </Pressable>
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
          <Typography style={[styles.phaseTitle, { color: C.success }]}>Connected!</Typography>
          <Typography style={styles.phaseSub}>{pendingConnection?.name}</Typography>
          <Typography style={styles.phaseUrl}>{pendingConnection?.url}</Typography>
        </View>
      </View>
    );
  }

  if (connectPhase === 'unreachable') {
    const urlStr = pendingConnection?.url || '';
    const isLocal = /^(ws|http)s?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(urlStr);

    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={C.text} />
          </Pressable>
          <Typography style={styles.topBarTitle}>Connection Issue</Typography>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={styles.phaseContent}>
          <View style={styles.unreachableIcon}>
            <Ionicons name="cloud-offline" size={48} color={C.error} />
          </View>
          <Typography style={styles.phaseTitle}>Can&apos;t reach your gateway</Typography>
          <Typography style={[styles.phaseSub, { paddingHorizontal: 24 }]}>{error}</Typography>
          <Typography style={[styles.phaseUrl, { marginTop: 4 }]}>{pendingConnection?.url}</Typography>

          <View style={styles.unreachableTips}>
            <Typography style={styles.tipHeader}>Things to check:</Typography>
            {isLocal ? (
              <>
                <View style={styles.tipRow}>
                  <Ionicons name="swap-horizontal" size={14} color={C.textSecondary} />
                  <Typography style={styles.tipText}>Make sure your gateway is bound to your LAN IP, not just localhost (127.0.0.1)</Typography>
                </View>
                <View style={styles.tipRow}>
                  <Ionicons name="wifi" size={14} color={C.textSecondary} />
                  <Typography style={styles.tipText}>Both devices need to be on the same WiFi network</Typography>
                </View>
                <View style={styles.tipRow}>
                  <Ionicons name="server-outline" size={14} color={C.textSecondary} />
                  <Typography style={styles.tipText}>Your gateway runs on port 18789 by default</Typography>
                </View>
              </>
            ) : (
              <>
                <View style={styles.tipRow}>
                  <Ionicons name="globe-outline" size={14} color={C.textSecondary} />
                  <Typography style={styles.tipText}>Check that your Tailscale is connected on both devices</Typography>
                </View>
                <View style={styles.tipRow}>
                  <Ionicons name="power-outline" size={14} color={C.textSecondary} />
                  <Typography style={styles.tipText}>Make sure the gateway is running</Typography>
                </View>
                <View style={styles.tipRow}>
                  <Ionicons name="shield-outline" size={14} color={C.textSecondary} />
                  <Typography style={styles.tipText}>Firewall may be blocking port 18789</Typography>
                </View>
              </>
            )}
          </View>

          <View style={styles.helpCmdCard}>
            <Ionicons name="terminal-outline" size={14} color={C.textTertiary} />
            <Typography style={styles.helpCmdText}>Need help? Run{'\n'}openclaw gateway --bind 0.0.0.0 --port 18789{'\n'}to make your gateway accessible on your network</Typography>
          </View>

          <View style={styles.unreachableActions}>
            <Pressable
              onPress={() => {
                if (pendingConnection) finishPairing(pendingConnection.name, pendingConnection.url, pendingConnection.token);
              }}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="refresh" size={18} color={C.accent} />
              <Typography style={[styles.retryBtnText, { color: C.accent }]}>Try again</Typography>
            </Pressable>
            <Pressable
              onPress={() => {
                if (pendingConnection) saveAndFinish(pendingConnection.name, pendingConnection.url, pendingConnection.token);
              }}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <Typography style={styles.saveAnywayText}>Save anyway for later</Typography>
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
            <Typography style={styles.topBarTitle}>Scan QR Code</Typography>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.webCameraFallback}>
            <View style={styles.fallbackIconWrap}>
              <Ionicons name="camera-outline" size={48} color={C.textTertiary} />
            </View>
            <Typography style={styles.fallbackTitle}>Camera not available on web</Typography>
            <Typography style={styles.fallbackSub}>Use ClawBase on your phone to scan QR codes, or try manual setup.</Typography>
            <Pressable onPress={() => setMethod('manual')} style={({ pressed }) => [styles.fallbackBtn, pressed && { opacity: 0.8 }]}>
              <Ionicons name="code-slash-outline" size={18} color={C.secondary} />
              <Typography style={[styles.fallbackBtnText, { color: C.secondary }]}>Manual Setup</Typography>
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
            <Typography style={styles.topBarTitle}>Scan QR Code</Typography>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.permissionContent}>
            <View style={styles.permissionIconWrap}>
              <Ionicons name="camera" size={40} color={C.accent} />
            </View>
            <Typography style={styles.permissionTitle}>Camera Access Required</Typography>
            <Typography style={styles.permissionSub}>We need camera access to scan your gateway&apos;s QR code.</Typography>
            <Pressable
              onPress={requestCameraPermission}
              style={({ pressed }) => [styles.permissionBtn, pressed && { opacity: 0.8 }]}
            >
              <LinearGradient colors={[C.primary, '#D43D3D']} style={styles.permissionBtnInner}>
                <Typography style={styles.permissionBtnText}>Allow Camera</Typography>
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
            <Typography style={[styles.topBarTitle, { color: '#FFF' }]}>Scan QR Code</Typography>
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
                <Typography style={styles.scanErrorText}>{error}</Typography>
              </View>
            )}
            <Typography style={styles.scanHint}>Point at the QR code on your OpenClaw gateway</Typography>
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
          <Typography style={styles.topBarTitle}>Pairing Code</Typography>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.codeContent} keyboardShouldPersistTaps="handled">
          <View style={styles.codeIconWrap}>
            <Ionicons name="keypad" size={36} color={C.coral} />
          </View>
          <Typography style={styles.codeTitle}>Pair with your gateway</Typography>
          <Typography style={styles.codeSub}>Enter your gateway address and the pairing code it displays. The app connects directly to your gateway.</Typography>

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
              <Typography style={styles.errorText}>{error}</Typography>
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
                  <Typography style={styles.codeBtnText}>Connect</Typography>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <View style={styles.codeHintRow}>
            <Ionicons name="information-circle-outline" size={14} color={C.textTertiary} />
            <Typography style={styles.codeHint}>The code is generated by your gateway and expires after 10 minutes</Typography>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (method === 'tailscale') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={C.text} />
          </Pressable>
          <Typography style={styles.topBarTitle}>Remote Connection</Typography>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.manualContent} keyboardShouldPersistTaps="handled">
          <View style={styles.codeIconWrap}>
            <Ionicons name="globe" size={36} color={C.secondary} />
          </View>
          <Typography style={styles.codeTitle}>Connect Remotely</Typography>
          <Typography style={styles.codeSub}>Connect to your gateway from anywhere. Enter your Tailscale hostname or public tunnel URL.</Typography>

          <TextInput
            style={styles.manualInput}
            placeholder="e.g. my-server.tail1234.ts.net"
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

          {error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={C.error} />
              <Typography style={styles.errorText}>{error}</Typography>
            </View>
          )}

          <Pressable
            onPress={() => finishPairing(manualName.trim() || 'Remote Gateway', manualUrl.trim(), manualToken.trim() || undefined)}
            disabled={!manualUrl.trim()}
            style={({ pressed }) => [
              styles.codeBtn,
              !manualUrl.trim() && { opacity: 0.4 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <LinearGradient colors={[C.primary, '#D43D3D']} style={styles.codeBtnInner}>
              <Ionicons name="flash" size={18} color="#FFF" />
              <Typography style={styles.codeBtnText}>Connect</Typography>
            </LinearGradient>
          </Pressable>

          <View style={styles.setupGuideCard}>
            <Typography style={styles.setupGuideTitle}>Setup Guide</Typography>
            <View style={styles.setupGuideStep}>
              <View style={styles.setupGuideStepNum}><Typography style={styles.setupGuideStepNumText}>1</Typography></View>
              <Typography style={styles.setupGuideStepText}>Install Tailscale on your gateway machine and this device</Typography>
            </View>
            <View style={styles.setupGuideStep}>
              <View style={styles.setupGuideStepNum}><Typography style={styles.setupGuideStepNumText}>2</Typography></View>
              <Typography style={styles.setupGuideStepText}>Your gateway&apos;s Tailscale address will look like: my-machine.tail1234.ts.net</Typography>
            </View>
            <View style={styles.setupGuideStep}>
              <View style={styles.setupGuideStepNum}><Typography style={styles.setupGuideStepNumText}>3</Typography></View>
              <Typography style={styles.setupGuideStepText}>Enter the address above — no port needed, we add :18789 automatically</Typography>
            </View>
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
          <Typography style={styles.topBarTitle}>Manual Setup</Typography>
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

          <Typography style={styles.helperText}>Default port is :18789 — added automatically if not specified</Typography>

          {error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={C.error} />
              <Typography style={styles.errorText}>{error}</Typography>
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
              <Typography style={styles.codeBtnText}>Connect</Typography>
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
        <Typography style={styles.topBarTitle}>Connect to Gateway</Typography>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.methodList}>
        {Platform.OS !== 'web' && (
          <View style={styles.discoverySection}>
            <View style={styles.discoverHeader}>
              <Typography style={styles.methodListTitle}>Nearby Gateways</Typography>
              <Pressable onPress={runDiscovery} disabled={scanning} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                {scanning ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Typography style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary }}>
                      {scanProgress.total > 0 ? `${Math.round((scanProgress.checked / scanProgress.total) * 100)}%` : 'Scanning...'}
                    </Typography>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="refresh" size={16} color={C.accent} />
                    <Typography style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: C.accent }}>Scan</Typography>
                  </View>
                )}
              </Pressable>
            </View>
            {discoveredGateways.length > 0 ? (
              discoveredGateways.map((gw) => (
                <Pressable
                  key={gw.host}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    finishPairing(gw.name, gw.url);
                  }}
                  style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient colors={['#151A15', '#101510']} style={styles.pairMethodCard}>
                    <View style={[styles.pairMethodIcon, { backgroundColor: C.success + '18' }]}>
                      <Ionicons name="server" size={24} color={C.success} />
                    </View>
                    <View style={styles.pairMethodInfo}>
                      <Typography style={styles.pairMethodTitle}>{gw.name}</Typography>
                      <Typography style={styles.pairMethodDesc}>{gw.host}:{gw.port}{gw.version ? ` \u00B7 v${gw.version}` : ''}</Typography>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                  </LinearGradient>
                </Pressable>
              ))
            ) : !scanning ? (
              <View style={{ paddingVertical: 12, paddingHorizontal: 8 }}>
                <Typography style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary }}>
                  No gateways found on your network. Try manual setup or make sure your gateway is running.
                </Typography>
              </View>
            ) : null}
          </View>
        )}

        <Typography style={[styles.methodListTitle, { marginTop: Platform.OS !== 'web' ? 12 : 0 }]}>Connect Manually</Typography>

        <Pressable onPress={() => { setMethod('qr'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={['#1A1520', '#151020']} style={styles.pairMethodCard}>
            <View style={[styles.pairMethodIcon, { backgroundColor: C.accent + '18' }]}>
              <Ionicons name="qr-code" size={28} color={C.accent} />
            </View>
            <View style={styles.pairMethodInfo}>
              <Typography style={styles.pairMethodTitle}>Scan QR Code</Typography>
              <Typography style={styles.pairMethodDesc}>Scan the QR code your gateway displays. Instant setup.</Typography>
            </View>
            <View style={[styles.pairMethodBadge, { backgroundColor: C.success + '18' }]}>
              <Typography style={[styles.pairMethodBadgeText, { color: C.success }]}>Recommended</Typography>
            </View>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => { setMethod('tailscale'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={['#151820', '#101518']} style={styles.pairMethodCard}>
            <View style={[styles.pairMethodIcon, { backgroundColor: C.secondary + '18' }]}>
              <Ionicons name="globe" size={28} color={C.secondary} />
            </View>
            <View style={styles.pairMethodInfo}>
              <Typography style={styles.pairMethodTitle}>Tailscale / Remote</Typography>
              <Typography style={styles.pairMethodDesc}>Connect from anywhere via Tailscale or public URL</Typography>
            </View>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => { setMethod('code'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={['#1A1815', '#151310']} style={styles.pairMethodCard}>
            <View style={[styles.pairMethodIcon, { backgroundColor: C.coral + '18' }]}>
              <Ionicons name="keypad" size={28} color={C.coral} />
            </View>
            <View style={styles.pairMethodInfo}>
              <Typography style={styles.pairMethodTitle}>Pairing Code</Typography>
              <Typography style={styles.pairMethodDesc}>Enter your gateway address and the code it shows.</Typography>
            </View>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => { setMethod('manual'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={['#151A1A', '#101515']} style={styles.pairMethodCard}>
            <View style={[styles.pairMethodIcon, { backgroundColor: C.secondary + '18' }]}>
              <Ionicons name="code-slash" size={28} color={C.secondary} />
            </View>
            <View style={styles.pairMethodInfo}>
              <Typography style={styles.pairMethodTitle}>Manual Setup</Typography>
              <Typography style={styles.pairMethodDesc}>Enter URL and token directly. For advanced users.</Typography>
            </View>
          </LinearGradient>
        </Pressable>

        <View style={styles.deepLinkHint}>
          <Ionicons name="link-outline" size={14} color={C.textTertiary} />
          <Typography style={styles.deepLinkHintText}>
            You can also tap a clawbase:// link from your gateway to connect automatically.
          </Typography>
        </View>
      </ScrollView>
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
  discoverySection: { gap: 10 },
  discoverHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  methodList: { paddingHorizontal: 20, paddingTop: 24, gap: 14, paddingBottom: 40 },
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
  helpCmdCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, width: '100%', backgroundColor: C.card, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginTop: 8 },
  helpCmdText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary, flex: 1, lineHeight: 18 },
  setupGuideCard: { width: '100%', backgroundColor: C.card, padding: 18, borderRadius: 14, borderWidth: 1, borderColor: C.border, gap: 14, marginTop: 8 },
  setupGuideTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text },
  setupGuideStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  setupGuideStepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.secondary + '20', alignItems: 'center', justifyContent: 'center' },
  setupGuideStepNumText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.secondary },
  setupGuideStepText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary, flex: 1, lineHeight: 19 },
});
