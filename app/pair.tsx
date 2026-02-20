import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;
const { width: SCREEN_W } = Dimensions.get('window');

type PairMethod = 'qr' | 'code' | 'manual';

export default function PairScreen() {
  const insets = useSafeAreaInsets();
  const { addConnection, setHasOnboarded, connectGateway } = useApp();
  const params = useLocalSearchParams<{ from?: string }>();
  const [method, setMethod] = useState<PairMethod | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualName, setManualName] = useState('');
  const [connectingResult, setConnectingResult] = useState<{ name: string; url: string } | null>(null);
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

  const finishPairing = useCallback(async (name: string, url: string, token?: string) => {
    setConnectingResult({ name, url });
    setError(null);
    try {
      let cleanUrl = url.trim();
      if (!cleanUrl.startsWith('http') && !cleanUrl.startsWith('ws')) {
        cleanUrl = 'http://' + cleanUrl;
      }
      await addConnection(name, cleanUrl, token || undefined);
      await setHasOnboarded(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 800);
    } catch (e: any) {
      setError(e?.message || 'Connection failed');
      setConnectingResult(null);
    }
  }, [addConnection, setHasOnboarded]);

  const handleQRScanned = useCallback(({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      if (data.startsWith('clawcockpit://') || data.startsWith('openclaw://')) {
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
      try {
        parsed = JSON.parse(data);
      } catch {}

      if (parsed?.url) {
        finishPairing(parsed.name || 'OpenClaw Gateway', parsed.url, parsed.token);
        return;
      }

      if (data.match(/^(https?:\/\/|wss?:\/\/|[\d.]+:\d+)/)) {
        finishPairing('OpenClaw Gateway', data);
        return;
      }

      setError('Unrecognized QR code. Expected an OpenClaw gateway QR.');
      setTimeout(() => setScanned(false), 2000);
    } catch {
      setError('Could not read QR code');
      setTimeout(() => setScanned(false), 2000);
    }
  }, [scanned, finishPairing]);

  const handleCodeLookup = useCallback(async () => {
    const code = pairCode.trim().toUpperCase();
    if (code.length < 4) return;
    setLookingUp(true);
    setError(null);
    try {
      const apiBase = Platform.OS === 'web'
        ? ''
        : `http://${process.env.EXPO_PUBLIC_DOMAIN || 'localhost:5000'}`;
      const resp = await fetch(`${apiBase}/api/pair/lookup/${code}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setError(err.error || 'Invalid pairing code');
        setLookingUp(false);
        return;
      }
      const { url, token, name } = await resp.json();
      await finishPairing(name || 'OpenClaw Gateway', url, token);
    } catch {
      setError('Could not reach pairing service');
    }
    setLookingUp(false);
  }, [pairCode, finishPairing]);

  const handleManualConnect = useCallback(async () => {
    if (!manualUrl.trim()) return;
    await finishPairing(manualName.trim() || 'My Gateway', manualUrl.trim(), manualToken.trim() || undefined);
  }, [manualUrl, manualToken, manualName, finishPairing]);

  const goBack = useCallback(() => {
    if (method) {
      setMethod(null);
      setError(null);
      setScanned(false);
    } else if (params.from === 'settings') {
      router.back();
    } else {
      router.replace('/onboarding');
    }
  }, [method, params.from]);

  if (connectingResult) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopPad, backgroundColor: C.background }]}>
        <View style={styles.successContent}>
          <Animated.View style={{ opacity: pulseAnim }}>
            <LinearGradient colors={[C.success, '#00B88A']} style={styles.successIcon}>
              <Ionicons name="checkmark" size={48} color="#FFF" />
            </LinearGradient>
          </Animated.View>
          <Text style={styles.successTitle}>Connected!</Text>
          <Text style={styles.successSub}>{connectingResult.name}</Text>
          <Text style={styles.successUrl}>{connectingResult.url}</Text>
        </View>
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
            <Text style={styles.fallbackSub}>Use the Expo Go app on your phone to scan QR codes, or try the pairing code method instead.</Text>
            <Pressable onPress={() => setMethod('code')} style={({ pressed }) => [styles.fallbackBtn, pressed && { opacity: 0.8 }]}>
              <Ionicons name="keypad-outline" size={18} color={C.secondary} />
              <Text style={[styles.fallbackBtnText, { color: C.secondary }]}>Use Pairing Code</Text>
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
            <Text style={styles.permissionSub}>We need camera access to scan your gateway's QR code for instant pairing.</Text>
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
            <Text style={styles.scanHint}>Point your camera at the QR code shown on your OpenClaw gateway</Text>
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
          <Text style={styles.topBarTitle}>Enter Pairing Code</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.codeContent}>
          <View style={styles.codeIconWrap}>
            <Ionicons name="keypad" size={36} color={C.coral} />
          </View>
          <Text style={styles.codeTitle}>Enter the 6-character code</Text>
          <Text style={styles.codeSub}>Your OpenClaw gateway displays a pairing code. Enter it below to connect instantly.</Text>

          <TextInput
            style={styles.codeInput}
            placeholder="ABC123"
            placeholderTextColor={C.textTertiary + '60'}
            value={pairCode}
            onChangeText={(t) => { setPairCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setError(null); }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            autoFocus
          />

          {error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={C.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleCodeLookup}
            disabled={pairCode.length < 4 || lookingUp}
            style={({ pressed }) => [
              styles.codeBtn,
              (pairCode.length < 4 || lookingUp) && { opacity: 0.4 },
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
            <Text style={styles.codeHint}>Codes expire after 10 minutes for security</Text>
          </View>
        </View>
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

        <View style={styles.manualContent}>
          <TextInput
            style={styles.manualInput}
            placeholder="Name (e.g. Home Server)"
            placeholderTextColor={C.textTertiary}
            value={manualName}
            onChangeText={setManualName}
          />
          <TextInput
            style={styles.manualInput}
            placeholder="Gateway URL (e.g. 192.168.1.100:18789)"
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
        </View>
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
              <Text style={styles.pairMethodDesc}>Point your camera at the QR code on your gateway. Fastest method.</Text>
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
              <Text style={styles.pairMethodTitle}>Enter Pairing Code</Text>
              <Text style={styles.pairMethodDesc}>Type the 6-character code shown on your gateway console.</Text>
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
              <Text style={styles.pairMethodDesc}>Enter your gateway URL and token directly.</Text>
            </View>
          </LinearGradient>
        </Pressable>

        <View style={styles.deepLinkHint}>
          <Ionicons name="link-outline" size={14} color={C.textTertiary} />
          <Text style={styles.deepLinkHintText}>
            You can also open a clawcockpit:// link from your gateway to connect automatically.
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
  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: C.success },
  successSub: { fontFamily: 'Inter_500Medium', fontSize: 16, color: C.text },
  successUrl: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary },
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
  codeContent: { flex: 1, paddingHorizontal: 24, paddingTop: 40, alignItems: 'center', gap: 14 },
  codeIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.coral + '15', alignItems: 'center', justifyContent: 'center' },
  codeTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: C.text },
  codeSub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  codeInput: { fontFamily: 'Inter_700Bold', fontSize: 32, color: C.text, textAlign: 'center', letterSpacing: 8, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingVertical: 20, paddingHorizontal: 24, width: '100%', marginTop: 8 },
  codeBtn: { borderRadius: 14, overflow: 'hidden', width: '100%' },
  codeBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  codeBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFF' },
  codeHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  codeHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.error + '10', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, width: '100%' },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.error, flex: 1 },
  manualContent: { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 14 },
  manualInput: { backgroundColor: C.card, borderRadius: 12, padding: 14, fontFamily: 'Inter_400Regular', fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border },
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
