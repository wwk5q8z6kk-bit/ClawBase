import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
  Animated,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { getGateway } from '@/lib/gateway';
import { PulsingDot } from '@/components/PulsingDot';
import { GlassCard } from '@/components/GlassCard';

const C = Colors.dark;

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

interface CronOutput {
  id: string;
  automationName: string;
  timestamp: number;
  success: boolean;
  output: string;
  duration?: number;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

const RISK_TIER_CONFIG: Record<string, { color: string; label: string; glowColor: string }> = {
  P1: { color: C.error, label: 'CRITICAL', glowColor: C.error + '40' },
  P2: { color: C.amber, label: 'REVIEW', glowColor: C.amber + '30' },
  P3: { color: C.textSecondary, label: 'LOW', glowColor: C.textSecondary + '15' },
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

function formatCountdown(expiresAt: number) {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatUptime(ms: number) {
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  running: { color: C.success, label: 'Running', icon: 'play-circle' },
  paused: { color: C.amber, label: 'Paused', icon: 'pause-circle' },
  error: { color: C.error, label: 'Error', icon: 'alert-circle' },
  idle: { color: C.textTertiary, label: 'Idle', icon: 'ellipse-outline' },
};

function ToastNotification({ toast, onHide }: { toast: ToastState; onHide: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (toast.visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(translateY, { toValue: -20, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
        ]).start(() => onHide());
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [onHide, opacity, toast.visible, translateY]);

  if (!toast.visible) return null;

  return (
    <Animated.View style={[styles.toastContainer, { opacity, transform: [{ translateY }] }]}>
      <LinearGradient
        colors={toast.type === 'success' ? C.gradient.alertSuccess : [C.error + '25', C.error + '10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.toastInner}
      >
        <Ionicons
          name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
          size={18}
          color={toast.type === 'success' ? C.success : C.error}
        />
        <Text style={[styles.toastText, { color: toast.type === 'success' ? C.success : C.error }]}>
          {toast.message}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

function QuickActionButton({
  icon,
  label,
  onPress,
  loading,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!loading) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }
      }}
      style={({ pressed }) => [pressed && !loading && { opacity: 0.7 }]}
    >
      <LinearGradient
        colors={C.gradient.cardElevated}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.quickActionPill}
      >
        {loading ? (
          <ActivityIndicator size={16} color={C.accent} />
        ) : (
          <Ionicons name={icon as any} size={16} color={C.accent} />
        )}
        <Text style={styles.quickActionText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function QuickActionsBar({
  connected,
  automations,
  onToast,
}: {
  connected: boolean;
  automations: Automation[];
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const executeAction = useCallback(async (actionKey: string, command: string) => {
    if (!connected) {
      onToast('Not connected to gateway', 'error');
      return;
    }
    setLoadingAction(actionKey);
    try {
      await getGateway().invokeCommand(command);
      onToast(`${actionKey} completed`, 'success');
    } catch {
      onToast(`${actionKey} failed`, 'error');
    } finally {
      setLoadingAction(null);
    }
  }, [connected, onToast]);

  const runAll = useCallback(async () => {
    if (!connected) {
      onToast('Not connected to gateway', 'error');
      return;
    }
    setLoadingAction('Run All');
    try {
      const enabled = automations.filter(a => a.enabled);
      const gw = getGateway() as any;
      for (const a of enabled) {
        await gw.rpc('automations.trigger', { id: a.id }).catch(() => { });
      }
      onToast(`Triggered ${enabled.length} automations`, 'success');
    } catch {
      onToast('Run All failed', 'error');
    } finally {
      setLoadingAction(null);
    }
  }, [connected, automations, onToast]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.quickActionsContainer}
    >
      <QuickActionButton
        icon="newspaper"
        label="Daily Brief"
        loading={loadingAction === 'Daily Brief'}
        onPress={() => executeAction('Daily Brief', 'daily-brief')}
      />
      <QuickActionButton
        icon="pulse"
        label="Health Check"
        loading={loadingAction === 'Health Check'}
        onPress={() => executeAction('Health Check', 'health-check')}
      />
      <QuickActionButton
        icon="sync-circle"
        label="Sync Memory"
        loading={loadingAction === 'Sync Memory'}
        onPress={() => executeAction('Sync Memory', 'sync-memory')}
      />
      <QuickActionButton
        icon="play-circle"
        label="Run All"
        loading={loadingAction === 'Run All'}
        onPress={runAll}
      />
    </ScrollView>
  );
}

function SystemHealthBanner() {
  const { gatewayStatus, gatewayInfo } = useApp();
  const connected = gatewayStatus === 'connected';

  const statusLabel = connected ? 'Connected' :
    gatewayStatus === 'connecting' ? 'Connecting...' :
      gatewayStatus === 'authenticating' ? 'Authenticating...' :
        gatewayStatus === 'pairing' ? 'Pairing...' :
          gatewayStatus === 'error' ? 'Error' : 'Disconnected';

  const statusColor = connected ? C.success :
    gatewayStatus === 'error' ? C.error :
      gatewayStatus === 'disconnected' ? C.textTertiary : C.amber;

  return (
    <GlassCard variant="card" style={styles.healthBanner}>
      <View style={styles.healthTop}>
        <View style={styles.healthLeft}>
          <View style={styles.healthDotWrap}>
            {connected ? (
              <PulsingDot color={C.success} size={10} />
            ) : (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor }} />
            )}
          </View>
          <View>
            <Text style={styles.healthTitle}>System Health</Text>
            <Text style={[styles.healthStatus, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={[styles.healthBadge, { backgroundColor: statusColor + '20' }]}>
          <Ionicons name={connected ? 'shield-checkmark' : 'shield-outline'} size={14} color={statusColor} />
        </View>
      </View>
      {connected && gatewayInfo.uptime !== undefined && (
        <View style={styles.healthStats}>
          <View style={styles.healthStat}>
            <Ionicons name="time-outline" size={14} color={C.textSecondary} />
            <Text style={styles.healthStatText}>Uptime: {formatUptime(gatewayInfo.uptime)}</Text>
          </View>
          {gatewayInfo.model && (
            <View style={styles.healthStat}>
              <Ionicons name="hardware-chip-outline" size={14} color={C.textSecondary} />
              <Text style={styles.healthStatText}>{gatewayInfo.model}</Text>
            </View>
          )}
        </View>
      )}
      {!connected && gatewayStatus === 'disconnected' && (
        <Text style={styles.healthHint}>Connect to a gateway to manage automations</Text>
      )}
    </GlassCard>
  );
}

function ApprovalCard({
  approval,
  onApprove,
  onDeny,
}: {
  approval: PendingApproval;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  const [countdown, setCountdown] = useState(formatCountdown(approval.expiresAt));
  const tierConfig = RISK_TIER_CONFIG[approval.riskTier] || RISK_TIER_CONFIG.P3;

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(approval.expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [approval.expiresAt]);

  const isExpired = approval.expiresAt - Date.now() <= 0;
  const isUrgent = approval.expiresAt - Date.now() < 60000 && !isExpired;

  return (
    <Pressable
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onApprove(approval.id);
      }}
      delayLongPress={800}
      style={({ pressed }) => [pressed && { opacity: 0.95 }]}
    >
      <LinearGradient
        colors={C.gradient.cardElevated}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.approvalCard,
          approval.riskTier === 'P1' && { borderColor: C.error + '40', ...C.shadow.glow },
        ]}
      >
        <View style={styles.approvalTop}>
          <View style={[styles.riskBadge, { backgroundColor: tierConfig.glowColor }]}>
            <Text style={[styles.riskText, { color: tierConfig.color }]}>
              {approval.riskTier} · {tierConfig.label}
            </Text>
          </View>
          <View style={styles.approvalExpiry}>
            <Ionicons
              name="timer-outline"
              size={12}
              color={isUrgent ? C.error : C.textTertiary}
            />
            <Text style={[
              styles.expiryText,
              isUrgent && { color: C.error },
              isExpired && { color: C.error },
            ]}>
              {countdown}
            </Text>
          </View>
        </View>
        <Text style={styles.approvalAction}>{approval.action}</Text>
        {approval.description ? (
          <Text style={styles.approvalDesc} numberOfLines={2}>{approval.description}</Text>
        ) : null}
        {approval.source ? (
          <View style={styles.approvalSource}>
            <Ionicons name="link-outline" size={11} color={C.textTertiary} />
            <Text style={styles.approvalSourceText}>{approval.source}</Text>
          </View>
        ) : null}
        <View style={styles.approvalActions}>
          <Pressable
            style={({ pressed }) => [styles.approvalBtn, styles.denyBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDeny(approval.id);
            }}
          >
            <Ionicons name="close" size={20} color={C.error} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.approvalBtn, styles.approveBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onApprove(approval.id);
            }}
          >
            <Ionicons name="checkmark" size={20} color={C.success} />
          </Pressable>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function AutomationItem({
  automation,
  onToggle,
  expanded,
  onPress,
}: {
  automation: Automation;
  onToggle: (id: string, enabled: boolean) => void;
  expanded: boolean;
  onPress: () => void;
}) {
  const config = STATUS_CONFIG[automation.status];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
      <View style={styles.automationItem}>
        <View style={styles.automationTop}>
          <View style={[styles.automationStatusDot, { backgroundColor: config.color }]} />
          <View style={styles.automationInfo}>
            <Text style={styles.automationName}>{automation.name}</Text>
            <View style={styles.automationMeta}>
              <Ionicons name="calendar-outline" size={12} color={C.textTertiary} />
              <Text style={styles.automationSchedule}>{automation.schedule}</Text>
              {automation.lastRun ? (
                <>
                  <View style={styles.metaDivider} />
                  <Ionicons name="time-outline" size={12} color={C.textTertiary} />
                  <Text style={styles.automationLastRun}>{formatTimeAgo(automation.lastRun)}</Text>
                </>
              ) : null}
            </View>
          </View>
          <View style={styles.automationRight}>
            <View style={[styles.statusPill, { backgroundColor: config.color + '18' }]}>
              <Ionicons name={config.icon as any} size={12} color={config.color} />
              <Text style={[styles.statusPillText, { color: config.color }]}>{config.label}</Text>
            </View>
            <Switch
              value={automation.enabled}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggle(automation.id, val);
              }}
              trackColor={{ false: C.border, true: C.success + '40' }}
              thumbColor={automation.enabled ? C.success : C.textTertiary}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        </View>
        {expanded && automation.lastOutput ? (
          <View style={styles.automationExpanded}>
            <Text style={styles.expandedLabel}>Recent Output</Text>
            <View style={styles.expandedOutput}>
              <Text style={styles.expandedOutputText} numberOfLines={6}>{automation.lastOutput}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function CronOutputItem({ output }: { output: CronOutput }) {
  return (
    <View style={styles.cronOutputItem}>
      <View style={[styles.cronStatusIcon, { backgroundColor: output.success ? C.success + '18' : C.error + '18' }]}>
        <Ionicons
          name={output.success ? 'checkmark-circle' : 'close-circle'}
          size={16}
          color={output.success ? C.success : C.error}
        />
      </View>
      <View style={styles.cronOutputInfo}>
        <Text style={styles.cronOutputName}>{output.automationName}</Text>
        <Text style={styles.cronOutputText} numberOfLines={1}>{output.output}</Text>
      </View>
      <View style={styles.cronOutputRight}>
        <Text style={styles.cronOutputTime}>{formatTimeAgo(output.timestamp)}</Text>
        {output.duration !== undefined && (
          <Text style={styles.cronOutputDuration}>{output.duration}ms</Text>
        )}
      </View>
    </View>
  );
}

function AnalyticsCard({ cronOutputs }: { cronOutputs: CronOutput[] }) {
  const analytics = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    const todayStart = now - (now % dayMs);
    const todayOutputs = cronOutputs.filter(o => o.timestamp >= todayStart);
    const totalToday = todayOutputs.length;
    const successCount = todayOutputs.filter(o => o.success).length;
    const successRate = totalToday > 0 ? Math.round((successCount / totalToday) * 100) : 0;
    const durations = todayOutputs.filter(o => o.duration !== undefined).map(o => o.duration!);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    const weekBars: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart - (i * dayMs);
      const dayEnd = dayStart + dayMs;
      weekBars.push(cronOutputs.filter(o => o.timestamp >= dayStart && o.timestamp < dayEnd).length);
    }
    const maxBar = Math.max(...weekBars, 1);

    return { totalToday, successRate, avgDuration, weekBars, maxBar };
  }, [cronOutputs]);

  return (
    <GlassCard variant="card" style={styles.analyticsCard}>
      <View style={styles.analyticsHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="analytics" size={16} color={C.accent} />
          <Text style={styles.sectionTitle}>Analytics</Text>
        </View>
      </View>
      <View style={styles.analyticsGrid}>
        <View style={styles.analyticsStat}>
          <Text style={styles.analyticsValue}>{analytics.totalToday}</Text>
          <Text style={styles.analyticsLabel}>Runs Today</Text>
        </View>
        <View style={styles.analyticsStat}>
          <Text style={[styles.analyticsValue, { color: C.success }]}>{analytics.successRate}%</Text>
          <Text style={styles.analyticsLabel}>Success Rate</Text>
        </View>
        <View style={styles.analyticsStat}>
          <Text style={styles.analyticsValue}>{analytics.avgDuration}ms</Text>
          <Text style={styles.analyticsLabel}>Avg Time</Text>
        </View>
      </View>
      <View style={styles.weekBarContainer}>
        {analytics.weekBars.map((val, idx) => (
          <View key={idx} style={styles.weekBarCol}>
            <View style={styles.weekBarTrack}>
              <LinearGradient
                colors={C.gradient.lobster}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={[
                  styles.weekBarFill,
                  { height: `${Math.max((val / analytics.maxBar) * 100, 4)}%` as any },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.weekLabels}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={styles.weekLabel}>{d}</Text>
        ))}
      </View>
    </GlassCard>
  );
}

export default function AutomationsScreen() {
  const insets = useSafeAreaInsets();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const { gatewayStatus } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [cronOutputs, setCronOutputs] = useState<CronOutput[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allPaused, setAllPaused] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const fetchData = useCallback(async () => {
    if (gatewayStatus !== 'connected') return;

    const gw = getGateway() as any;

    try {
      const automationList = await gw.rpc('automations.list');
      if (Array.isArray(automationList)) {
        setAutomations(automationList.map((a: any) => ({
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
    } catch { }

    try {
      const approvalList = await gw.rpc('automations.approvals');
      if (Array.isArray(approvalList)) {
        setApprovals(approvalList.map((a: any) => ({
          id: a.id,
          action: a.action || a.title || 'Unknown action',
          description: a.description || '',
          riskTier: a.riskTier || a.tier || 'P3',
          expiresAt: a.expiresAt || Date.now() + 300000,
          source: a.source,
        })));
      }
    } catch { }

    try {
      const outputs = await gw.rpc('automations.outputs', { limit: 5 });
      if (Array.isArray(outputs)) {
        setCronOutputs(outputs.map((o: any) => ({
          id: o.id || String(o.timestamp),
          automationName: o.automationName || o.name || 'Unknown',
          timestamp: o.timestamp || Date.now(),
          success: o.success !== false,
          output: o.output || o.result || '',
          duration: o.duration,
        })));
      }
    } catch { }
  }, [gatewayStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time event subscriptions — approvals appear instantly
  useEffect(() => {
    const gw = getGateway();

    // New approval requested
    const unsubTool = gw.on('tool_call', (event) => {
      const data = event.data;
      if (data?.type === 'exec.approval.requested' || data?.event === 'exec.approval.requested') {
        const payload = data.data || data.payload || data;
        const newApproval: PendingApproval = {
          id: payload.id || 'approval-' + Date.now(),
          action: payload.action || payload.title || 'Unknown action',
          description: payload.description || '',
          riskTier: payload.riskTier || payload.tier || 'P2',
          expiresAt: payload.expiresAt || Date.now() + 300000,
          source: payload.source,
        };
        setApprovals(prev => {
          if (prev.some(a => a.id === newApproval.id)) return prev;
          return [newApproval, ...prev];
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      // Automation status update
      if (data?.type === 'automation.status' || data?.event === 'automation.status') {
        const payload = data.data || data.payload || data;
        if (payload.id) {
          setAutomations(prev =>
            prev.map(a => a.id === payload.id ? {
              ...a,
              status: payload.status || a.status,
              lastRun: payload.lastRun || a.lastRun,
              lastOutput: payload.output || a.lastOutput,
            } : a),
          );
        }
      }
    });

    // Notification events (from push notification system)
    const unsubNotif = gw.on('notification', (event) => {
      const data = event.data;
      if (data?.approvalId) {
        // Re-fetch approvals to get the latest state
        fetchData();
      }
    });

    return () => { unsubTool(); unsubNotif(); };
  }, [fetchData]);

  // Auto-refresh every 30s when connected
  useEffect(() => {
    if (gatewayStatus !== 'connected') return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [gatewayStatus, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleToggleAutomation = useCallback(async (id: string, enabled: boolean) => {
    setAutomations((prev) =>
      prev.map((a) => a.id === id ? { ...a, enabled } : a),
    );
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.rpc('automations.toggle', { id, enabled });
      } catch { }
    }
  }, [gatewayStatus]);

  const handleApprove = useCallback(async (id: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.rpc('automations.approve', { id });
      } catch { }
    }
  }, [gatewayStatus]);

  const handleDeny = useCallback(async (id: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.rpc('automations.deny', { id });
      } catch { }
    }
  }, [gatewayStatus]);

  const handleApproveAllP3 = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const p3Approvals = approvals.filter(a => a.riskTier === 'P3');
    setApprovals(prev => prev.filter(a => a.riskTier !== 'P3'));
    if (gatewayStatus === 'connected') {
      const gw = getGateway() as any;
      for (const a of p3Approvals) {
        try {
          await gw.rpc('automations.approve', { id: a.id });
        } catch { }
      }
    }
    showToast(`Approved ${p3Approvals.length} low-risk items`, 'success');
  }, [approvals, gatewayStatus, showToast]);

  const handleTogglePauseAll = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const newPaused = !allPaused;
    setAllPaused(newPaused);
    setAutomations(prev =>
      prev.map(a => ({ ...a, enabled: !newPaused, status: newPaused ? 'paused' as const : 'idle' as const })),
    );
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.rpc('automations.pauseAll', { paused: newPaused });
      } catch { }
    }
    showToast(newPaused ? 'All automations paused' : 'All automations resumed', newPaused ? 'error' : 'success');
  }, [allPaused, gatewayStatus, showToast]);

  const connected = gatewayStatus === 'connected';
  const hasP3 = approvals.some(a => a.riskTier === 'P3');

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <ToastNotification toast={toast} onHide={hideToast} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Automations</Text>
        <View style={styles.headerRight}>
          {connected && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRefresh();
              }}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="refresh" size={20} color={C.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <SystemHealthBanner />

        <QuickActionsBar
          connected={connected}
          automations={automations}
          onToast={showToast}
        />

        {allPaused && (
          <LinearGradient
            colors={C.gradient.alertWarn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pausedBanner}
          >
            <Ionicons name="pause-circle" size={18} color={C.amber} />
            <Text style={styles.pausedBannerText}>All automations paused</Text>
          </LinearGradient>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="shield-checkmark" size={16} color={C.amber} />
              <Text style={styles.sectionTitle}>Pending Approvals</Text>
            </View>
            {approvals.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: C.amber + '20' }]}>
                <Text style={[styles.countText, { color: C.amber }]}>{approvals.length}</Text>
              </View>
            )}
          </View>
          {approvals.length > 0 ? (
            <View style={styles.approvalsList}>
              {approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                />
              ))}
              {hasP3 && (
                <Pressable
                  onPress={handleApproveAllP3}
                  style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                >
                  <LinearGradient
                    colors={C.gradient.cardElevated}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.approveAllP3Btn}
                  >
                    <Ionicons name="checkmark-done" size={16} color={C.success} />
                    <Text style={styles.approveAllP3Text}>Approve All P3</Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="shield-outline" size={28} color={C.textTertiary} />
              <Text style={styles.emptyTitle}>No pending approvals</Text>
              <Text style={styles.emptyDesc}>
                {connected
                  ? 'Risky actions from your automations will appear here for review'
                  : 'Connect to a gateway to see approval requests'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="flash" size={16} color={C.coral} />
              <Text style={styles.sectionTitle}>Active Automations</Text>
            </View>
            <View style={styles.automationHeaderRight}>
              {automations.length > 0 && (
                <Text style={styles.automationCount}>
                  {automations.filter((a) => a.enabled).length}/{automations.length} active
                </Text>
              )}
              {automations.length > 0 && (
                <Pressable
                  onPress={handleTogglePauseAll}
                  style={({ pressed }) => [styles.pauseAllBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons
                    name={allPaused ? 'play' : 'pause'}
                    size={14}
                    color={allPaused ? C.success : C.amber}
                  />
                  <Text style={[styles.pauseAllText, { color: allPaused ? C.success : C.amber }]}>
                    {allPaused ? 'Resume' : 'Pause'} All
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
          {automations.length > 0 ? (
            <View style={styles.automationsList}>
              {automations.map((automation) => (
                <AutomationItem
                  key={automation.id}
                  automation={automation}
                  onToggle={handleToggleAutomation}
                  expanded={expandedId === automation.id}
                  onPress={() => setExpandedId(expandedId === automation.id ? null : automation.id)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="flash-outline" size={28} color={C.textTertiary} />
              <Text style={styles.emptyTitle}>No automations configured</Text>
              <Text style={styles.emptyDesc}>
                {connected
                  ? 'Heartbeat checks and cron jobs will appear here when configured on your gateway'
                  : 'Connect to a gateway to view and manage your automations'}
              </Text>
            </View>
          )}
        </View>

        <AnalyticsCard cronOutputs={cronOutputs} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="terminal" size={16} color={C.purple} />
              <Text style={styles.sectionTitle}>Recent Outputs</Text>
            </View>
          </View>
          {cronOutputs.length > 0 ? (
            <View style={styles.outputsList}>
              {cronOutputs.map((output) => (
                <CronOutputItem key={output.id} output={output} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="terminal-outline" size={28} color={C.textTertiary} />
              <Text style={styles.emptyTitle}>No recent outputs</Text>
              <Text style={styles.emptyDesc}>
                {connected
                  ? 'Results from your cron jobs and automations will appear here'
                  : 'Connect to a gateway to see automation run history'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: C.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 20,
  },
  healthBanner: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  healthTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  healthLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  healthDotWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: C.text,
  },
  healthStatus: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  healthBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  healthStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  healthStatText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textSecondary,
  },
  healthHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    marginTop: 10,
  },
  toastContainer: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    zIndex: 100,
    alignItems: 'center',
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  toastText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  quickActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  quickActionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.text,
  },
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.amber + '30',
  },
  pausedBannerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.amber,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  automationCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.textSecondary,
  },
  automationHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pauseAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  pauseAllText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  approvalsList: {
    gap: 10,
  },
  approvalCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 10,
  },
  approvalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  riskText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  approvalExpiry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textTertiary,
  },
  approvalAction: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  approvalDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },
  approvalSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  approvalSourceText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  approvalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 2,
  },
  approvalBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  denyBtn: {
    backgroundColor: C.error + '12',
    borderColor: C.error + '30',
  },
  approveBtn: {
    backgroundColor: C.success + '12',
    borderColor: C.success + '30',
  },
  approveAllP3Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.success + '25',
  },
  approveAllP3Text: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.success,
  },
  automationsList: {
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
  automationItem: {
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  automationTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  automationStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  automationInfo: {
    flex: 1,
    gap: 4,
  },
  automationName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
  },
  automationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  automationSchedule: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  metaDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.textTertiary,
    marginHorizontal: 4,
  },
  automationLastRun: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  automationRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  automationExpanded: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 6,
  },
  expandedLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textSecondary,
  },
  expandedOutput: {
    backgroundColor: C.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  expandedOutputText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
    lineHeight: 16,
  },
  analyticsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 14,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  analyticsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  analyticsStat: {
    alignItems: 'center',
    gap: 4,
  },
  analyticsValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: C.text,
  },
  analyticsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
  },
  weekBarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 32,
    paddingHorizontal: 8,
  },
  weekBarCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%' as any,
  },
  weekBarTrack: {
    width: 10,
    height: '100%' as any,
    borderRadius: 5,
    backgroundColor: C.surface,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  weekBarFill: {
    width: '100%' as any,
    borderRadius: 5,
  },
  weekLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center' as const,
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: C.textTertiary,
  },
  outputsList: {
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
  cronOutputItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  cronStatusIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cronOutputInfo: {
    flex: 1,
    gap: 2,
  },
  cronOutputName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
  },
  cronOutputText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  cronOutputRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  cronOutputTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
  },
  cronOutputDuration: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: C.textTertiary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.textSecondary,
  },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
});
