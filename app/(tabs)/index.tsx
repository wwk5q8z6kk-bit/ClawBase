import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;

const QUICK_ACTIONS = [
  { id: '1', icon: 'mail-outline', label: 'Summarize Inbox', color: C.accent },
  { id: '2', icon: 'git-branch-outline', label: 'Check GitHub', color: C.secondary },
  { id: '3', icon: 'calendar-outline', label: 'Today\'s Agenda', color: C.warning },
  { id: '4', icon: 'analytics-outline', label: 'System Status', color: C.primary },
] as const;

function StatusCard() {
  const { activeConnection, tasks } = useApp();
  const connected = !!activeConnection;
  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const pendingTasks = tasks.filter((t) => t.status === 'todo').length;

  return (
    <LinearGradient
      colors={['#1A2040', '#141829']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.statusCard}
    >
      <View style={styles.statusHeader}>
        <View style={styles.statusDot}>
          <View
            style={[
              styles.dot,
              { backgroundColor: connected ? C.success : C.textTertiary },
            ]}
          />
          <Text style={styles.statusText}>
            {connected ? 'Gateway Connected' : 'Not Connected'}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/settings');
          }}
        >
          <Feather name="settings" size={20} color={C.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.statsRow}>
        <StatItem value={activeTasks} label="Active" color={C.accent} />
        <View style={styles.statDivider} />
        <StatItem value={pendingTasks} label="Pending" color={C.warning} />
        <View style={styles.statDivider} />
        <StatItem
          value={tasks.filter((t) => t.status === 'done').length}
          label="Done"
          color={C.success}
        />
      </View>
    </LinearGradient>
  );
}

function StatItem({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickAction,
        pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
      ]}
      onPress={onPress}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RecentActivityItem({
  icon,
  title,
  time,
  color,
}: {
  icon: string;
  title: string;
  time: string;
  color: string;
}) {
  return (
    <View style={styles.activityItem}>
      <View style={[styles.activityIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.activityTime}>{time}</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { conversations, tasks, memoryEntries, refreshAll, isLoading } = useApp();
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

  const formatTimeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const recentItems = [
    ...conversations.slice(0, 3).map((c) => ({
      icon: 'chatbubble-outline',
      title: c.title,
      time: formatTimeAgo(c.lastMessageTime),
      color: C.accent,
    })),
    ...tasks
      .filter((t) => t.status !== 'done')
      .slice(0, 3)
      .map((t) => ({
        icon: 'checkbox-outline',
        title: t.title,
        time: formatTimeAgo(t.updatedAt),
        color:
          t.priority === 'urgent'
            ? C.primary
            : t.priority === 'high'
              ? C.warning
              : C.secondary,
      })),
  ]
    .sort((a, b) => {
      const getMs = (s: string) => {
        if (s === 'Just now') return 0;
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
          style={({ pressed }) => [
            styles.newChatBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add" size={24} color={C.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
      >
        <StatusCard />

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          {QUICK_ACTIONS.map((action) => (
            <QuickActionButton
              key={action.id}
              icon={action.icon}
              label={action.label}
              color={action.color}
              onPress={() => handleQuickAction(action.label)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {recentItems.length > 0 ? (
          <View style={styles.activityList}>
            {recentItems.map((item, i) => (
              <RecentActivityItem key={i} {...item} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="robot-outline"
              size={48}
              color={C.textTertiary}
            />
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
    fontSize: 14,
    color: C.textSecondary,
    marginTop: 2,
  },
  newChatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 20,
    paddingTop: 8,
  },
  statusCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
    fontSize: 28,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: C.border,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
    marginTop: 4,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickAction: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.text,
    flex: 1,
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
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: C.text,
  },
  activityTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.textSecondary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textTertiary,
    textAlign: 'center',
  },
});
