import React, { useState, useCallback, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { getGateway } from '@/lib/gateway';

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

function PulsingDot({ color, size = 8 }: { color: string; size?: number }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: pulseAnim,
      }}
    />
  );
}

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

const RISK_COLORS: Record<string, string> = {
  P1: C.primary,
  P2: C.amber,
  P3: C.textSecondary,
};

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
    <LinearGradient
      colors={C.gradient.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.healthBanner}
    >
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
    </LinearGradient>
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
  const riskColor = RISK_COLORS[approval.riskTier] || C.textSecondary;

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(approval.expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [approval.expiresAt]);

  return (
    <LinearGradient
      colors={C.gradient.cardElevated}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.approvalCard}
    >
      <View style={styles.approvalTop}>
        <View style={[styles.riskBadge, { backgroundColor: riskColor + '20' }]}>
          <Text style={[styles.riskText, { color: riskColor }]}>{approval.riskTier}</Text>
        </View>
        <View style={styles.approvalExpiry}>
          <Ionicons name="timer-outline" size={12} color={C.textTertiary} />
          <Text style={styles.expiryText}>{countdown}</Text>
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

export default function AutomationsScreen() {
  const insets = useSafeAreaInsets();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const { gatewayStatus, activeConnection, gateway } = useApp();

  const [refreshing, setRefreshing] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [cronOutputs, setCronOutputs] = useState<CronOutput[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    } catch {}

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
    } catch {}

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
    } catch {}
  }, [gatewayStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      } catch {}
    }
  }, [gatewayStatus]);

  const handleApprove = useCallback(async (id: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.rpc('automations.approve', { id });
      } catch {}
    }
  }, [gatewayStatus]);

  const handleDeny = useCallback(async (id: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    if (gatewayStatus === 'connected') {
      try {
        const gw = getGateway() as any;
        await gw.rpc('automations.deny', { id });
      } catch {}
    }
  }, [gatewayStatus]);

  const connected = gatewayStatus === 'connected';

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
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
            {automations.length > 0 && (
              <Text style={styles.automationCount}>
                {automations.filter((a) => a.enabled).length}/{automations.length} active
              </Text>
            )}
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
