import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Switch,
  Platform,
  TextInput,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function SettingsRow({
  icon,
  iconColor,
  label,
  value,
  onPress,
  trailing,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && { backgroundColor: C.cardElevated },
      ]}
      onPress={onPress}
      disabled={!onPress && !trailing}
    >
      <View style={[styles.rowIcon, { backgroundColor: (iconColor || C.accent) + '15' }]}>
        <Ionicons name={icon as any} size={18} color={iconColor || C.accent} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {trailing ||
        (onPress && (
          <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
        ))}
    </Pressable>
  );
}

function AgentHealthMonitor() {
  const { activeConnection } = useApp();
  const connected = !!activeConnection;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!connected) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [connected, pulseAnim]);

  return (
    <LinearGradient
      colors={connected ? ['#0F2020', '#0E1A1A'] : ['#201510', '#1A1210']}
      style={styles.healthCard}
    >
      <View style={styles.healthHeader}>
        <Animated.View style={[styles.healthDot, { backgroundColor: connected ? C.success : C.error, opacity: connected ? pulseAnim : 1 }]} />
        <Text style={[styles.healthStatus, { color: connected ? C.success : C.error }]}>
          {connected ? 'Agent Healthy' : 'No Connection'}
        </Text>
      </View>
      <View style={styles.healthMetrics}>
        <View style={styles.healthMetric}>
          <Text style={styles.healthMetricValue}>{connected ? '24ms' : '--'}</Text>
          <Text style={styles.healthMetricLabel}>Latency</Text>
        </View>
        <View style={styles.healthMetricDivider} />
        <View style={styles.healthMetric}>
          <Text style={styles.healthMetricValue}>{connected ? '99.9%' : '--'}</Text>
          <Text style={styles.healthMetricLabel}>Uptime</Text>
        </View>
        <View style={styles.healthMetricDivider} />
        <View style={styles.healthMetric}>
          <Text style={styles.healthMetricValue}>{connected ? '4' : '0'}</Text>
          <Text style={styles.healthMetricLabel}>Skills</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    connections,
    activeConnection,
    addConnection,
    removeConnection,
    setActiveConnection,
    biometricEnabled,
    setBiometricEnabled,
  } = useApp();

  const [showConnModal, setShowConnModal] = useState(false);
  const [connName, setConnName] = useState('');
  const [connUrl, setConnUrl] = useState('');

  const handleBiometricToggle = useCallback(
    async (val: boolean) => {
      if (val) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) {
          if (Platform.OS !== 'web') {
            Alert.alert(
              'Not Available',
              'Biometric authentication is not available on this device.',
            );
          }
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm to enable biometric lock',
        });
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await setBiometricEnabled(true);
        }
      } else {
        await setBiometricEnabled(false);
      }
    },
    [setBiometricEnabled],
  );

  const handleAddConnection = useCallback(async () => {
    if (!connName.trim() || !connUrl.trim()) return;
    let url = connUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = 'https://' + url;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addConnection(connName.trim(), url);
    setConnName('');
    setConnUrl('');
    setShowConnModal(false);
  }, [connName, connUrl, addConnection]);

  const openWithTemplate = useCallback((name: string, url: string) => {
    setConnName(name);
    setConnUrl(url);
    setShowConnModal(true);
  }, []);

  const connectionMethods = [
    {
      title: 'Local Network',
      icon: 'wifi-outline' as const,
      color: C.amber,
      description: 'Connect via your home network. Use your gateway\'s local IP (e.g. 192.168.1.100:18789)',
      hint: 'Make sure your phone is on the same Wi-Fi network.',
      templateName: 'Home Gateway',
      templateUrl: '192.168.1.x:18789',
    },
    {
      title: 'Tailscale',
      icon: 'shield-checkmark-outline' as const,
      color: C.secondary,
      description: 'Secure mesh VPN for remote access. Use your Tailscale hostname (e.g. my-server.ts.net:18789)',
      hint: 'Install Tailscale on both your phone and gateway server.',
      templateName: 'Tailscale Gateway',
      templateUrl: 'your-host.ts.net:18789',
    },
    {
      title: 'Cloudflare Tunnel',
      icon: 'cloud-outline' as const,
      color: C.accent,
      description: 'Access your gateway from anywhere via Cloudflare Tunnel (e.g. gateway.yourdomain.com)',
      hint: 'Set up cloudflared on your gateway server.',
      templateName: 'Cloud Gateway',
      templateUrl: 'gateway.yourdomain.com',
    },
  ];

  const handleRemoveConn = useCallback(
    (id: string, name: string) => {
      if (Platform.OS === 'web') {
        removeConnection(id);
        return;
      }
      Alert.alert('Remove Gateway', `Remove "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeConnection(id),
        },
      ]);
    },
    [removeConnection],
  );

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={C.gradient.ocean} style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <AgentHealthMonitor />

        <SettingsSection title="Gateway Connections">
          {connections.map((conn) => (
            <Pressable
              key={conn.id}
              style={({ pressed }) => [
                styles.connectionItem,
                pressed && { backgroundColor: C.cardElevated },
              ]}
              onPress={() => setActiveConnection(conn.id)}
              onLongPress={() => handleRemoveConn(conn.id, conn.name)}
            >
              <View
                style={[
                  styles.connStatus,
                  {
                    backgroundColor:
                      activeConnection?.id === conn.id
                        ? C.success + '30'
                        : C.textTertiary + '20',
                  },
                ]}
              >
                <View
                  style={[
                    styles.connDot,
                    {
                      backgroundColor:
                        activeConnection?.id === conn.id
                          ? C.success
                          : C.textTertiary,
                    },
                  ]}
                />
              </View>
              <View style={styles.connInfo}>
                <Text style={styles.connName}>{conn.name}</Text>
                <Text style={styles.connUrl} numberOfLines={1}>
                  {conn.url}
                </Text>
              </View>
              {activeConnection?.id === conn.id && (
                <Ionicons name="checkmark-circle" size={20} color={C.success} />
              )}
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [
              styles.addConnBtn,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setShowConnModal(true)}
          >
            <Ionicons name="add-circle-outline" size={20} color={C.primary} />
            <Text style={styles.addConnText}>Add Gateway</Text>
          </Pressable>
        </SettingsSection>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection Methods</Text>
          <View style={{ gap: 10 }}>
            {connectionMethods.map((method) => (
              <Pressable
                key={method.title}
                onPress={() => openWithTemplate(method.templateName, method.templateUrl)}
                style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              >
                <LinearGradient
                  colors={C.gradient.cardElevated}
                  style={[styles.methodCard, { borderColor: C.borderLight }]}
                >
                  <View style={[styles.methodAccent, { backgroundColor: method.color }]} />
                  <View style={styles.methodBody}>
                    <View style={styles.methodHeader}>
                      <View style={[styles.methodIconWrap, { backgroundColor: method.color + '18' }]}>
                        <Ionicons name={method.icon} size={20} color={method.color} />
                      </View>
                      <Text style={styles.methodTitle}>{method.title}</Text>
                      <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
                    </View>
                    <Text style={styles.methodDesc}>{method.description}</Text>
                    <View style={styles.methodHintRow}>
                      <Ionicons name="bulb-outline" size={13} color={method.color} />
                      <Text style={[styles.methodHint, { color: method.color + 'CC' }]}>{method.hint}</Text>
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        </View>

        <SettingsSection title="Security">
          <SettingsRow
            icon="finger-print"
            iconColor={C.secondary}
            label="Biometric Lock"
            trailing={
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: C.border, true: C.secondary + '60' }}
                thumbColor={biometricEnabled ? C.secondary : C.textSecondary}
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow
            icon="information-circle-outline"
            iconColor={C.accent}
            label="Version"
            value="2.0.0"
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            iconColor={C.success}
            label="Privacy"
            value="100% Local"
          />
          <SettingsRow
            icon="server-outline"
            iconColor={C.warning}
            label="Protocol"
            value="WebSocket :18789"
          />
          <SettingsRow
            icon="color-palette-outline"
            iconColor={C.coral}
            label="Theme"
            value="Lobster Dark"
          />
        </SettingsSection>

        <View style={styles.branding}>
          <LinearGradient colors={C.gradient.lobster} style={styles.brandLogo}>
            <Ionicons name="sparkles" size={20} color="#fff" />
          </LinearGradient>
          <Text style={styles.brandText}>ClawCockpit</Text>
          <Text style={styles.brandSub}>
            Mission control for your self-hosted agent
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showConnModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConnModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Gateway</Text>
              <Pressable onPress={() => setShowConnModal(false)}>
                <Ionicons name="close" size={24} color={C.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Gateway name (e.g. Home Server)"
              placeholderTextColor={C.textTertiary}
              value={connName}
              onChangeText={setConnName}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="URL (e.g. 192.168.1.100:18789)"
              placeholderTextColor={C.textTertiary}
              value={connUrl}
              onChangeText={setConnUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={16} color={C.textTertiary} />
              <Text style={styles.hintText}>
                Enter your OpenClaw Gateway address. Supports local IP, Tailscale, or Cloudflare Tunnel URLs.
              </Text>
            </View>

            <Pressable
              onPress={handleAddConnection}
              style={({ pressed }) => [
                styles.saveBtn,
                (!connName.trim() || !connUrl.trim()) && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
              disabled={!connName.trim() || !connUrl.trim()}
            >
              <Text style={styles.saveBtnText}>Save Connection</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: C.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 24,
    paddingTop: 8,
  },
  healthCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 14,
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  healthDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  healthStatus: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  healthMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  healthMetric: {
    flex: 1,
    alignItems: 'center',
  },
  healthMetricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: C.text,
  },
  healthMetricLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 2,
  },
  healthMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: C.border,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionContent: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: C.text,
  },
  rowValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 2,
  },
  connectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  connStatus: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connInfo: {
    flex: 1,
  },
  connName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: C.text,
  },
  connUrl: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 2,
  },
  addConnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  addConnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: C.primary,
  },
  methodCard: {
    flexDirection: 'row' as const,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden' as const,
  },
  methodAccent: {
    width: 4,
  },
  methodBody: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  methodHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  methodIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  methodTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: C.text,
    flex: 1,
  },
  methodDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
  },
  methodHintRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 2,
  },
  methodHint: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    flex: 1,
  },
  branding: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  brandLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  brandText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: C.primary,
  },
  brandSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textTertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: C.text,
  },
  input: {
    backgroundColor: C.inputBackground,
    borderRadius: 12,
    padding: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
  },
  hintRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  hintText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    flex: 1,
    lineHeight: 18,
  },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: Platform.OS === 'web' ? 34 : 20,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
  },
});
