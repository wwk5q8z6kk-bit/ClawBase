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
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { getGateway } from '@/lib/gateway';

interface Automation {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  status: 'running' | 'paused' | 'error' | 'idle';
  lastRun?: number;
  lastOutput?: string;
  type: 'heartbeat' | 'cron';
}

interface PendingApproval {
  id: string;
  action: string;
  description: string;
  riskTier: 'P1' | 'P2' | 'P3';
  expiresAt: number;
  source?: string;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  running: { color: Colors.dark.success, label: 'Running', icon: 'play-circle' },
  paused: { color: Colors.dark.amber, label: 'Paused', icon: 'pause-circle' },
  error: { color: Colors.dark.error, label: 'Error', icon: 'alert-circle' },
  idle: { color: Colors.dark.textTertiary, label: 'Idle', icon: 'ellipse-outline' },
};

function formatTimeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
  const { gatewayStatus, gatewayInfo } = useApp();
  const isConnected = gatewayStatus === 'connected';
  const isConnecting = gatewayStatus === 'connecting' || gatewayStatus === 'authenticating';
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isConnecting && !isConnected) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isConnected, isConnecting, pulseAnim]);

  const statusLabel = isConnected ? 'Gateway Connected' : isConnecting ? 'Connecting...' : gatewayStatus === 'pairing' ? 'Awaiting Approval' : gatewayStatus === 'error' ? 'Connection Error' : 'Disconnected';
  const statusColor = isConnected ? C.success : isConnecting || gatewayStatus === 'pairing' ? C.amber : gatewayStatus === 'error' ? C.error : C.textTertiary;

  return (
    <LinearGradient
      colors={isConnected ? ['#0F2020', '#0E1A1A'] : isConnecting ? ['#201A10', '#1A1510'] : ['#201510', '#1A1210']}
      style={styles.healthCard}
    >
      <View style={styles.healthHeader}>
        <Animated.View style={[styles.healthDot, { backgroundColor: statusColor, opacity: isConnecting ? pulseAnim : 1 }]} />
        <Text style={[styles.healthStatus, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <View style={styles.healthMetrics}>
        <View style={styles.healthMetric}>
          <Text style={styles.healthMetricValue}>{isConnected ? gatewayInfo.channels.filter(c => c.status === 'active').length.toString() : '--'}</Text>
          <Text style={styles.healthMetricLabel}>Channels</Text>
        </View>
        <View style={styles.healthMetricDivider} />
        <View style={styles.healthMetric}>
          <Text style={styles.healthMetricValue}>{isConnected ? gatewayInfo.totalSessions.toString() : '--'}</Text>
          <Text style={styles.healthMetricLabel}>Sessions</Text>
        </View>
        <View style={styles.healthMetricDivider} />
        <View style={styles.healthMetric}>
          <Text style={styles.healthMetricValue}>{isConnected && gatewayInfo.model ? '1' : isConnected ? '0' : '--'}</Text>
          <Text style={styles.healthMetricLabel}>Model</Text>
        </View>
      </View>
      {isConnected && gatewayInfo.model && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Ionicons name="sparkles" size={12} color={C.coral} />
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary }}>{gatewayInfo.model}</Text>
          {gatewayInfo.agentName && <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary }}>· {gatewayInfo.agentName}</Text>}
        </View>
      )}
      {gatewayStatus === 'error' && (
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: C.error, marginTop: 4 }}>Check your gateway URL and token</Text>
      )}
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
    tasks,
    conversations,
    memoryEntries,
    crmContacts,
    calendarEvents,
    refreshAll,
    gatewayStatus,
    gateway,
    connectGateway,
    disconnectGateway,
  } = useApp();

  const [showConnModal, setShowConnModal] = useState(false);
  const [connName, setConnName] = useState('');
  const [connUrl, setConnUrl] = useState('');
  const [connToken, setConnToken] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [automationsLoading, setAutomationsLoading] = useState(false);
  const [quickActionLoading, setQuickActionLoading] = useState<string | null>(null);
  const [showApprovals, setShowApprovals] = useState(false);

  const [storageStats, setStorageStats] = useState<{
    tasks: number;
    conversations: number;
    memories: number;
    contacts: number;
    events: number;
  } | null>(null);

  const loadStorageStats = useCallback(async () => {
    try {
      await AsyncStorage.getAllKeys();

      setStorageStats({
        tasks: tasks.length,
        conversations: conversations.length,
        memories: memoryEntries.length,
        contacts: crmContacts.length,
        events: calendarEvents.length,
      });
    } catch {}
  }, [tasks, conversations, memoryEntries, crmContacts, calendarEvents]);

  useEffect(() => {
    loadStorageStats();
  }, [loadStorageStats]);

  useEffect(() => {
    const unsub = gateway.on('error', (event) => {
      setConnectionError(event.data?.message || 'Connection failed');
    });
    const unsub2 = gateway.on('status_change', (event) => {
      if (event.data?.status === 'connected') {
        setConnectionError(null);
      }
    });
    return () => { unsub(); unsub2(); };
  }, [gateway]);

  const fetchAutomationsData = useCallback(async () => {
    if (gatewayStatus !== 'connected') return;
    setAutomationsLoading(true);
    try {
      const gw = getGateway();
      const [autoList, approvalList] = await Promise.all([
        gw.fetchAutomations(),
        gw.fetchApprovals(),
      ]);
      if (Array.isArray(autoList)) {
        setAutomations(autoList.map((a: any) => ({
          id: a.id || a.name,
          name: a.name || a.id,
          schedule: a.schedule || a.cron || 'Manual',
          enabled: a.enabled !== false,
          status: a.status || 'idle',
          lastRun: a.lastRun || a.lastRunAt,
          lastOutput: a.lastOutput || a.output,
          type: a.type || 'cron',
        })));
      }
      if (Array.isArray(approvalList)) {
        setApprovals(approvalList.map((a: any) => ({
          id: a.id,
          action: a.action || a.title || 'Unknown action',
          description: a.description || '',
          riskTier: a.riskTier || a.risk || 'P3',
          expiresAt: a.expiresAt || Date.now() + 300000,
          source: a.source,
        })));
      }
    } catch {}
    setAutomationsLoading(false);
  }, [gatewayStatus]);

  useEffect(() => {
    fetchAutomationsData();
  }, [fetchAutomationsData]);

  const handleToggleAutomation = useCallback(async (id: string, enabled: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled } : a));
    try {
      await getGateway().toggleAutomation(id, enabled);
    } catch {
      setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled: !enabled } : a));
    }
  }, []);

  const handlePauseResumeAll = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const anyEnabled = automations.some(a => a.enabled);
    const newEnabled = !anyEnabled;
    setAutomations(prev => prev.map(a => ({ ...a, enabled: newEnabled })));
    try {
      const gw = getGateway();
      for (const a of automations) {
        await gw.toggleAutomation(a.id, newEnabled);
      }
    } catch {}
  }, [automations]);

  const handleQuickAction = useCallback(async (label: string, command: string) => {
    if (gatewayStatus !== 'connected') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickActionLoading(label);
    try {
      await getGateway().invokeCommand(command);
    } catch {}
    setQuickActionLoading(null);
  }, [gatewayStatus]);

  const enabledCount = automations.filter(a => a.enabled).length;
  const pausedCount = automations.filter(a => !a.enabled).length;

  const handleTestConnection = useCallback(async () => {
    if (!connUrl.trim()) return;
    setTestingConnection(true);
    setTestResult(null);
    try {
      let url = connUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ws://') && !url.startsWith('wss://')) {
        url = 'http://' + url;
      }
      const testGw = new (gateway.constructor as any)();
      const ok = await testGw.healthCheck.call({ url: url.replace(/^ws/, 'http') });
      if (ok) {
        setTestResult({ ok: true, msg: 'Gateway is reachable!' });
      } else {
        setTestResult({ ok: false, msg: 'Gateway not responding. Check URL.' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Could not reach gateway.' });
    }
    setTestingConnection(false);
  }, [connUrl, gateway]);

  const handleManualConnect = useCallback(async () => {
    if (!activeConnection) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConnectionError(null);
    try {
      await connectGateway(activeConnection.url, activeConnection.token || '');
    } catch {
      setConnectionError('Failed to connect');
    }
  }, [activeConnection, connectGateway]);

  const handleManualDisconnect = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    disconnectGateway();
    setConnectionError(null);
  }, [disconnectGateway]);

  const handleExportData = useCallback(async () => {
    try {
      const exportData = {
        meta: {
          exportDate: new Date().toISOString(),
          app: 'ClawBase',
          version: '1.0',
          counts: {
            tasks: tasks.length,
            conversations: conversations.length,
            memoryEntries: memoryEntries.length,
            calendarEvents: calendarEvents.length,
            crmContacts: crmContacts.length,
            connections: connections.length,
          },
        },
        tasks,
        conversations,
        memoryEntries,
        calendarEvents,
        crmContacts,
        connections,
      };

      const jsonString = JSON.stringify(exportData, null, 2);

      if (Platform.OS === 'web') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'clawbase-backup.json';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } else {
        const backupFile = new FileSystem.File(FileSystem.Paths.document, 'clawbase-backup.json');
        backupFile.create({ overwrite: true, intermediates: true });
        backupFile.write(jsonString, { encoding: 'utf8' });

        await Sharing.shareAsync(backupFile.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export ClawBase Data',
          UTI: 'public.json',
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      if (Platform.OS !== 'web') {
        Alert.alert('Export Failed', 'Could not export data. Please try again.');
      }
    }
  }, [tasks, conversations, memoryEntries, calendarEvents, crmContacts, connections]);

  const handleClearAllData = useCallback(() => {
    const doClear = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const clawKeys = keys.filter(k => k.startsWith('@clawbase:'));
        await AsyncStorage.multiRemove(clawKeys);
        await refreshAll();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    };
    if (Platform.OS === 'web') {
      doClear();
    } else {
      Alert.alert(
        'Clear All Data',
        'This will delete all your local data including tasks, conversations, memories, contacts, and calendar events. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear All', style: 'destructive', onPress: doClear },
        ]
      );
    }
  }, [refreshAll]);

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
      url = 'http://' + url;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addConnection(connName.trim(), url, connToken.trim() || undefined);
    setConnName('');
    setConnUrl('');
    setConnToken('');
    setTestResult(null);
    setShowConnModal(false);
  }, [connName, connUrl, connToken, addConnection]);

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
                        ? (gatewayStatus === 'connected' ? C.success : gatewayStatus === 'connecting' || gatewayStatus === 'authenticating' ? C.amber : gatewayStatus === 'error' ? C.error : C.textTertiary) + '30'
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
                          ? (gatewayStatus === 'connected' ? C.success : gatewayStatus === 'connecting' || gatewayStatus === 'authenticating' ? C.amber : gatewayStatus === 'error' ? C.error : C.textTertiary)
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
          {activeConnection && (
            <View style={styles.connActions}>
              {connectionError && (
                <View style={styles.connError}>
                  <Ionicons name="alert-circle" size={14} color={C.error} />
                  <Text style={styles.connErrorText}>{connectionError}</Text>
                </View>
              )}
              <View style={styles.connBtns}>
                {gatewayStatus === 'connected' ? (
                  <Pressable
                    style={({ pressed }) => [styles.connActionBtn, styles.connDisconnectBtn, pressed && { opacity: 0.7 }]}
                    onPress={handleManualDisconnect}
                  >
                    <Ionicons name="power" size={16} color={C.error} />
                    <Text style={[styles.connActionText, { color: C.error }]}>Disconnect</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.connActionBtn, styles.connConnectBtn, pressed && { opacity: 0.7 }]}
                    onPress={handleManualConnect}
                    disabled={gatewayStatus === 'connecting' || gatewayStatus === 'authenticating'}
                  >
                    <Ionicons name="flash" size={16} color={C.secondary} />
                    <Text style={[styles.connActionText, { color: C.secondary }]}>
                      {gatewayStatus === 'connecting' || gatewayStatus === 'authenticating' ? 'Connecting...' : 'Connect'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.addConnBtn,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => router.push({ pathname: '/pair', params: { from: 'settings' } })}
          >
            <Ionicons name="qr-code-outline" size={20} color={C.accent} />
            <Text style={[styles.addConnText, { color: C.accent }]}>Scan / Pair</Text>
          </Pressable>
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
            {connectionMethods.map((method, index) => (
              <Pressable
                key={method.title}
                onPress={() => openWithTemplate(method.templateName, method.templateUrl)}
                style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              >
                <LinearGradient
                  colors={C.gradient.cardElevated}
                  style={[styles.methodCard, { borderColor: C.borderLight }]}
                >
                  {index === 0 && (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedText}>Recommended</Text>
                    </View>
                  )}
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

        <SettingsSection title="Automations">
          {gatewayStatus !== 'connected' && automations.length === 0 ? (
            <View style={styles.autoEmptyState}>
              <View style={styles.autoEmptyIconWrap}>
                <Ionicons name="flash-outline" size={40} color={C.amber} />
              </View>
              <Text style={styles.autoEmptyTitle}>Automations</Text>
              <Text style={styles.autoEmptySubtitle}>Connect to your gateway to manage heartbeat and cron automations</Text>
            </View>
          ) : (
            <>
              <View style={styles.autoSummaryCard}>
                <View style={styles.autoSummaryRow}>
                  <View style={styles.autoSummaryStat}>
                    <Text style={[styles.autoSummaryCount, { color: C.success }]}>{enabledCount}</Text>
                    <Text style={styles.autoSummaryLabel}>Enabled</Text>
                  </View>
                  <View style={styles.autoSummaryDivider} />
                  <View style={styles.autoSummaryStat}>
                    <Text style={[styles.autoSummaryCount, { color: C.amber }]}>{pausedCount}</Text>
                    <Text style={styles.autoSummaryLabel}>Paused</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.autoPauseAllBtn, pressed && { opacity: 0.7 }]}
                    onPress={handlePauseResumeAll}
                  >
                    <Ionicons
                      name={enabledCount > 0 ? 'pause' : 'play'}
                      size={14}
                      color={enabledCount > 0 ? C.amber : C.success}
                    />
                    <Text style={[styles.autoPauseAllText, { color: enabledCount > 0 ? C.amber : C.success }]}>
                      {enabledCount > 0 ? 'Pause All' : 'Resume All'}
                    </Text>
                  </Pressable>
                </View>
              </View>
              {automationsLoading && automations.length === 0 ? (
                <View style={styles.autoLoadingWrap}>
                  <ActivityIndicator size="small" color={C.accent} />
                </View>
              ) : (
                automations.map((auto) => {
                  const config = STATUS_CONFIG[auto.status] || STATUS_CONFIG.idle;
                  return (
                    <View key={auto.id} style={styles.autoItem}>
                      <View style={[styles.autoStatusDot, { backgroundColor: config.color }]} />
                      <View style={styles.autoItemContent}>
                        <Text style={styles.autoItemName}>{auto.name}</Text>
                        <Text style={styles.autoItemSchedule}>
                          {auto.schedule}
                          {auto.lastRun ? ` · ${formatTimeAgo(auto.lastRun)}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.autoStatusPill, { backgroundColor: config.color + '18' }]}>
                        <Ionicons name={config.icon as any} size={11} color={config.color} />
                        <Text style={[styles.autoStatusText, { color: config.color }]}>{config.label}</Text>
                      </View>
                      <Switch
                        value={auto.enabled}
                        onValueChange={(val) => handleToggleAutomation(auto.id, val)}
                        trackColor={{ false: C.border, true: C.success + '40' }}
                        thumbColor={auto.enabled ? C.success : C.textTertiary}
                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                      />
                    </View>
                  );
                })
              )}
            </>
          )}
          <View style={styles.quickActionsRow}>
            {[
              { label: 'Daily Brief', icon: 'newspaper', cmd: 'daily-brief' },
              { label: 'Health Check', icon: 'pulse', cmd: 'health-check' },
              { label: 'Sync Memory', icon: 'sync-circle', cmd: 'sync-memory' },
            ].map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [styles.quickActionChip, pressed && { opacity: 0.7 }]}
                onPress={() => handleQuickAction(action.label, action.cmd)}
                disabled={quickActionLoading === action.label}
              >
                {quickActionLoading === action.label ? (
                  <ActivityIndicator size={14} color={C.accent} />
                ) : (
                  <Ionicons name={action.icon as any} size={14} color={C.accent} />
                )}
                <Text style={styles.quickActionChipText}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
          <SettingsRow
            icon="shield-checkmark-outline"
            iconColor={approvals.length > 0 ? C.amber : C.textTertiary}
            label="Pending Approvals"
            value={`${approvals.length} pending`}
            onPress={() => setShowApprovals(true)}
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

        <SettingsSection title="Data & Storage">
          {storageStats && (() => {
            const items = [
              { label: 'Tasks', count: storageStats.tasks, icon: 'checkbox-outline', color: C.amber },
              { label: 'Chats', count: storageStats.conversations, icon: 'chatbubble-outline', color: C.coral },
              { label: 'Memories', count: storageStats.memories, icon: 'document-text-outline', color: C.accent },
              { label: 'Contacts', count: storageStats.contacts, icon: 'people-outline', color: C.secondary },
              { label: 'Events', count: storageStats.events, icon: 'calendar-outline', color: '#8B7FFF' },
            ];
            const maxCount = Math.max(...items.map(i => i.count), 1);
            return (
              <View style={styles.storageGrid}>
                {items.map((item) => (
                  <View key={item.label} style={styles.storageItem}>
                    <View style={[styles.storageItemIcon, { backgroundColor: item.color + '15' }]}>
                      <Ionicons name={item.icon as any} size={16} color={item.color} />
                    </View>
                    <Text style={styles.storageItemCount}>{item.count}</Text>
                    <Text style={styles.storageItemLabel}>{item.label}</Text>
                    <View style={styles.storageBarTrack}>
                      <View style={[styles.storageBarFill, { width: `${(item.count / maxCount) * 100}%` }]} />
                    </View>
                  </View>
                ))}
              </View>
            );
          })()}
          <SettingsRow
            icon="cloud-download-outline"
            iconColor={C.accent}
            label="Export Data"
            value="JSON"
            onPress={handleExportData}
          />
          <SettingsRow
            icon="trash-outline"
            iconColor={C.error}
            label="Clear All Data"
            onPress={handleClearAllData}
          />
        </SettingsSection>

        <View style={styles.branding}>
          <LinearGradient colors={C.gradient.lobster} style={styles.brandLogo}>
            <Ionicons name="sparkles" size={20} color="#fff" />
          </LinearGradient>
          <Text style={styles.brandText}>ClawBase</Text>
          <Text style={styles.brandSub}>
            Mission control for your self-hosted agent
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showApprovals}
        transparent
        animationType="slide"
        onRequestClose={() => setShowApprovals(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pending Approvals</Text>
              <Pressable onPress={() => setShowApprovals(false)}>
                <Ionicons name="close" size={24} color={C.textSecondary} />
              </Pressable>
            </View>
            {approvals.length === 0 ? (
              <View style={styles.approvalEmptyWrap}>
                <Ionicons name="checkmark-done-outline" size={32} color={C.textTertiary} />
                <Text style={styles.approvalEmptyText}>No pending approvals</Text>
              </View>
            ) : (
              approvals.map((approval) => (
                <View key={approval.id} style={styles.approvalItem}>
                  <View style={styles.approvalItemHeader}>
                    <View style={[styles.approvalRiskBadge, { backgroundColor: (approval.riskTier === 'P1' ? C.error : approval.riskTier === 'P2' ? C.amber : C.textTertiary) + '20' }]}>
                      <Text style={[styles.approvalRiskText, { color: approval.riskTier === 'P1' ? C.error : approval.riskTier === 'P2' ? C.amber : C.textTertiary }]}>{approval.riskTier}</Text>
                    </View>
                    <Text style={styles.approvalAction} numberOfLines={1}>{approval.action}</Text>
                  </View>
                  {approval.description ? (
                    <Text style={styles.approvalDesc} numberOfLines={2}>{approval.description}</Text>
                  ) : null}
                  <View style={styles.approvalBtnsRow}>
                    <Pressable
                      style={({ pressed }) => [styles.approvalDenyBtn, pressed && { opacity: 0.7 }]}
                      onPress={async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        try { await getGateway().denyAction(approval.id); } catch {}
                        setApprovals(prev => prev.filter(a => a.id !== approval.id));
                      }}
                    >
                      <Text style={styles.approvalDenyText}>Deny</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.approvalApproveBtn, pressed && { opacity: 0.7 }]}
                      onPress={async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        try { await getGateway().approveAction(approval.id); } catch {}
                        setApprovals(prev => prev.filter(a => a.id !== approval.id));
                      }}
                    >
                      <Text style={styles.approvalApproveText}>Approve</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </Modal>

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
              <Pressable onPress={() => { setShowConnModal(false); setTestResult(null); }}>
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
              onChangeText={(t) => { setConnUrl(t); setTestResult(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TextInput
              style={styles.input}
              placeholder="Auth token (optional)"
              placeholderTextColor={C.textTertiary}
              value={connToken}
              onChangeText={setConnToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />

            <Pressable
              onPress={handleTestConnection}
              style={({ pressed }) => [
                styles.testConnectionBtn,
                (!connUrl.trim() || testingConnection) && { opacity: 0.5 },
                pressed && { opacity: 0.8 },
              ]}
              disabled={!connUrl.trim() || testingConnection}
            >
              {testingConnection ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Ionicons name="pulse-outline" size={16} color={C.accent} />
              )}
              <Text style={styles.testConnectionBtnText}>
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </Text>
            </Pressable>

            {testResult && (
              <View style={[styles.testResultRow, { borderColor: testResult.ok ? C.success + '30' : C.error + '30', backgroundColor: testResult.ok ? C.success + '08' : C.error + '08' }]}>
                <Ionicons name={testResult.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={testResult.ok ? C.success : C.error} />
                <Text style={[styles.testResultText, { color: testResult.ok ? C.success : C.error }]}>{testResult.msg}</Text>
              </View>
            )}

            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={16} color={C.textTertiary} />
              <Text style={styles.hintText}>
                Enter your OpenClaw Gateway address and optional auth token. Supports local IP, Tailscale, or Cloudflare Tunnel URLs.
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
              <Text style={styles.saveBtnText}>Save & Connect</Text>
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
  storageGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  storageItem: { alignItems: 'center' as const, width: 60, gap: 4, paddingVertical: 8 },
  storageItemIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  storageItemCount: { fontFamily: 'Inter_700Bold', fontSize: 16, color: C.text },
  storageItemLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
  connActions: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.borderLight },
  connError: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: C.error + '10', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  connErrorText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.error, flex: 1 },
  connBtns: { flexDirection: 'row' as const, gap: 8 },
  connActionBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 10, borderRadius: 10 },
  connConnectBtn: { backgroundColor: C.secondary + '15', borderWidth: 1, borderColor: C.secondary + '30' },
  connDisconnectBtn: { backgroundColor: C.error + '10', borderWidth: 1, borderColor: C.error + '20' },
  connActionText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  testConnectionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.accent + '30',
    backgroundColor: C.accent + '10',
    paddingVertical: 10,
  },
  testConnectionBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.accent,
  },
  testResultRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  testResultText: { fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1 },
  autoSummaryCard: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  autoSummaryRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  autoSummaryStat: { alignItems: 'center' as const },
  autoSummaryCount: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  autoSummaryLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textSecondary, marginTop: 2 },
  autoSummaryDivider: { width: 1, height: 28, backgroundColor: C.border },
  autoPauseAllBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginLeft: 'auto' as const, backgroundColor: C.cardElevated, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.borderLight },
  autoPauseAllText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  autoLoadingWrap: { padding: 20, alignItems: 'center' as const },
  autoItem: { flexDirection: 'row' as const, alignItems: 'center' as const, padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  autoStatusDot: { width: 8, height: 8, borderRadius: 4 },
  autoItemContent: { flex: 1 },
  autoItemName: { fontFamily: 'Inter_500Medium', fontSize: 15, color: C.text },
  autoItemSchedule: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, marginTop: 2 },
  autoStatusPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  autoStatusText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  quickActionsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  quickActionChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: C.cardElevated, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.borderLight },
  quickActionChipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.accent },
  approvalEmptyWrap: { alignItems: 'center' as const, paddingVertical: 24, gap: 8 },
  approvalEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textTertiary },
  approvalItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight, gap: 6 },
  approvalItemHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  approvalRiskBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  approvalRiskText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  approvalAction: { fontFamily: 'Inter_500Medium', fontSize: 15, color: C.text, flex: 1 },
  approvalDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  approvalBtnsRow: { flexDirection: 'row' as const, gap: 8, marginTop: 4 },
  approvalDenyBtn: { flex: 1, backgroundColor: C.errorMuted, borderRadius: 8, paddingVertical: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  approvalDenyText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.error },
  approvalApproveBtn: { flex: 1, backgroundColor: C.successMuted, borderRadius: 8, paddingVertical: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  approvalApproveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.success },
  autoEmptyState: { alignItems: 'center' as const, paddingVertical: 28, paddingHorizontal: 24, gap: 8 },
  autoEmptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.amberMuted, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 4 },
  autoEmptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text },
  autoEmptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary, textAlign: 'center' as const },
  recommendedBadge: { position: 'absolute' as const, top: 8, right: 8, backgroundColor: C.secondaryMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, zIndex: 1 },
  recommendedText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.secondary },
  storageBarTrack: { width: '100%' as const, height: 2, backgroundColor: C.border, borderRadius: 1, marginTop: 2 },
  storageBarFill: { height: 2, backgroundColor: C.coral, borderRadius: 1 },
});
