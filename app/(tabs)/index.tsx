import React, { useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
  Animated,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;

const QUICK_ACTIONS = [
  { id: '1', icon: 'mail-outline', label: 'Summarize\nInbox', color: C.coral },
  { id: '2', icon: 'git-branch-outline', label: 'Check\nGitHub', color: C.secondary },
  { id: '3', icon: 'calendar-outline', label: "Today's\nAgenda", color: C.amber },
  { id: '4', icon: 'analytics-outline', label: 'System\nStatus', color: C.accent },
  { id: '5', icon: 'shield-checkmark-outline', label: 'Security\nScan', color: C.success },
  { id: '6', icon: 'cloud-download-outline', label: 'Sync\nData', color: '#8B7FFF' },
  { id: '7', icon: 'bulb-outline', label: 'Daily\nBrief', color: '#FF9F5A' },
  { id: '8', icon: 'terminal-outline', label: 'Run\nCommand', color: C.textSecondary },
] as const;

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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: pulseAnim,
        }}
      />
    </View>
  );
}

function ProactiveAlert({ type, message, onPress }: { type: 'info' | 'warn' | 'success'; message: string; onPress: () => void }) {
  const configs = {
    info: { icon: 'information-circle', colors: C.gradient.alertInfo, iconColor: C.accent, borderColor: C.accent + '30' },
    warn: { icon: 'warning', colors: C.gradient.alertWarn, iconColor: C.amber, borderColor: C.amber + '30' },
    success: { icon: 'checkmark-circle', colors: ['#0A2020', '#0E1A1A'] as [string, string], iconColor: C.success, borderColor: C.success + '30' },
  };
  const config = configs[type];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
      <LinearGradient
        colors={config.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.alertCard, { borderColor: config.borderColor }]}
      >
        <Ionicons name={config.icon as any} size={20} color={config.iconColor} />
        <Text style={styles.alertText} numberOfLines={2}>{message}</Text>
        <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
      </LinearGradient>
    </Pressable>
  );
}

function AgentStatusCard() {
  const { activeConnection, tasks, memoryEntries } = useApp();
  const connected = !!activeConnection;
  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const pendingTasks = tasks.filter((t) => t.status === 'todo').length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;

  return (
    <LinearGradient
      colors={['#1A2040', '#141829']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.statusCard}
    >
      <View style={styles.statusHeader}>
        <View style={styles.statusDot}>
          {connected ? (
            <PulsingDot color={C.success} />
          ) : (
            <View style={[styles.dot, { backgroundColor: C.textTertiary }]} />
          )}
          <Text style={[styles.statusText, connected && { color: C.success }]}>
            {connected ? activeConnection.name : 'Not Connected'}
          </Text>
        </View>
        {connected && (
          <View style={styles.latencyBadge}>
            <Text style={styles.latencyText}>24ms</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <StatItem value={activeTasks} label="Active" color={C.coral} />
        <View style={styles.statDivider} />
        <StatItem value={pendingTasks} label="Pending" color={C.amber} />
        <View style={styles.statDivider} />
        <StatItem value={doneTasks} label="Done" color={C.success} />
        <View style={styles.statDivider} />
        <StatItem value={memoryEntries.length} label="Memories" color={C.accent} />
      </View>

      {connected && (
        <View style={styles.skillsRow}>
          {['Email', 'GitHub', 'Calendar', 'Shell'].map((skill) => (
            <View key={skill} style={styles.skillPill}>
              <View style={[styles.skillDot, { backgroundColor: C.success }]} />
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ))}
        </View>
      )}
    </LinearGradient>
  );
}

function StatItem({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MemoryTeaser() {
  const { memoryEntries } = useApp();
  const latest = memoryEntries.slice(0, 3);
  if (latest.length === 0) return null;

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Memories</Text>
        <Pressable onPress={() => router.push('/(tabs)/memory')}>
          <Text style={styles.seeAll}>See All</Text>
        </Pressable>
      </View>
      <View style={styles.memoryTeaserCard}>
        {latest.map((mem, i) => (
          <View key={mem.id}>
            <Pressable
              style={styles.memoryTeaserItem}
              onPress={() => router.push('/(tabs)/memory')}
            >
              <View style={[styles.memoryDot, { backgroundColor: C.accent }]} />
              <View style={styles.memoryTeaserContent}>
                <Text style={styles.memoryTeaserTitle} numberOfLines={1}>{mem.title}</Text>
                <Text style={styles.memoryTeaserText} numberOfLines={1}>{mem.content}</Text>
              </View>
              <Text style={styles.memoryTeaserTime}>
                {formatTimeAgo(mem.timestamp)}
              </Text>
            </Pressable>
            {i < latest.length - 1 && <View style={styles.memoryDivider} />}
          </View>
        ))}
      </View>
    </View>
  );
}

function formatTimeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function QuickActionTile({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickTile,
        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
      ]}
      onPress={onPress}
    >
      <View style={[styles.quickTileIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.quickTileLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function RecentActivityItem({ icon, title, time, color }: { icon: string; title: string; time: string; color: string }) {
  return (
    <View style={styles.activityItem}>
      <View style={[styles.activityIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.activityTime}>{time}</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { conversations, tasks, memoryEntries, refreshAll, activeConnection } = useApp();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const handleQuickAction = useCallback(async (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(tabs)/chat');
  }, []);

  const recentItems = [
    ...conversations.slice(0, 3).map((c) => ({
      icon: 'chatbubble-outline',
      title: c.title,
      time: formatTimeAgo(c.lastMessageTime),
      color: C.coral,
    })),
    ...tasks
      .filter((t) => t.status !== 'done')
      .slice(0, 3)
      .map((t) => ({
        icon: 'checkbox-outline',
        title: t.title,
        time: formatTimeAgo(t.updatedAt),
        color:
          t.priority === 'urgent' ? C.primary
          : t.priority === 'high' ? C.amber
          : C.secondary,
      })),
  ]
    .sort((a, b) => {
      const getMs = (s: string) => {
        if (s === 'Now') return 0;
        const n = parseInt(s);
        if (s.includes('m')) return n * 60000;
        if (s.includes('h')) return n * 3600000;
        return n * 86400000;
      };
      return getMs(a.time) - getMs(b.time);
    })
    .slice(0, 5);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>ClawCockpit</Text>
          <Text style={styles.subtitle}>Mission Control</Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/chat');
          }}
          style={({ pressed }) => [styles.newChatBtn, pressed && { opacity: 0.7 }]}
        >
          <LinearGradient
            colors={C.gradient.lobster}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.newChatBtnGrad}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
      >
        {!activeConnection && (
          <ProactiveAlert
            type="warn"
            message="No gateway connected. Tap to set up your OpenClaw connection."
            onPress={() => router.push('/(tabs)/settings')}
          />
        )}

        {tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').length > 0 && (
          <ProactiveAlert
            type="info"
            message={`${tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').length} urgent task(s) need attention`}
            onPress={() => router.push('/(tabs)/tasks')}
          />
        )}

        <AgentStatusCard />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <FlatList
          data={QUICK_ACTIONS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <QuickActionTile
              icon={item.icon}
              label={item.label}
              color={item.color}
              onPress={() => handleQuickAction(item.label)}
            />
          )}
          contentContainerStyle={styles.quickActionsScroll}
          scrollEnabled={QUICK_ACTIONS.length > 0}
        />

        <MemoryTeaser />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {recentItems.length > 0 && (
            <Pressable onPress={() => router.push('/(tabs)/memory')}>
              <Text style={styles.seeAll}>View All</Text>
            </Pressable>
          )}
        </View>
        {recentItems.length > 0 ? (
          <View style={styles.activityList}>
            {recentItems.map((item, i) => (
              <RecentActivityItem key={i} {...item} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="robot-outline" size={40} color={C.textTertiary} />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySubtitle}>
              Start a chat or create a task to get going
            </Text>
          </View>
        )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  greeting: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: C.text,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 2,
  },
  newChatBtn: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  newChatBtnGrad: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
    paddingTop: 4,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
  },
  alertText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
    flex: 1,
    lineHeight: 18,
  },
  statusCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    gap: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: C.textSecondary,
  },
  latencyBadge: {
    backgroundColor: C.successMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  latencyText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: C.success,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: C.border,
  },
  skillsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  skillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  skillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  skillText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
  },
  seeAll: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.primary,
  },
  quickActionsScroll: {
    gap: 10,
  },
  quickTile: {
    width: 80,
    alignItems: 'center',
    gap: 8,
  },
  quickTileIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  memoryTeaserCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
  memoryTeaserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  memoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  memoryTeaserContent: {
    flex: 1,
  },
  memoryTeaserTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
  },
  memoryTeaserText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    marginTop: 1,
  },
  memoryTeaserTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  memoryDivider: {
    height: 1,
    backgroundColor: C.borderLight,
    marginLeft: 28,
  },
  activityList: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
  },
  activityTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: C.textSecondary,
    marginTop: 6,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textTertiary,
    textAlign: 'center',
  },
});
