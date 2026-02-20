import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
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
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';

const C = Colors.dark;

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

function ProactiveAlert({ type, message, icon, onPress }: { type: 'info' | 'warn' | 'success'; message: string; icon?: string; onPress: () => void }) {
  const configs = {
    info: { icon: icon || 'information-circle', colors: C.gradient.alertInfo, iconColor: C.accent, borderColor: C.accent + '30' },
    warn: { icon: icon || 'warning', colors: C.gradient.alertWarn, iconColor: C.amber, borderColor: C.amber + '30' },
    success: { icon: icon || 'checkmark-circle', colors: C.gradient.alertSuccess, iconColor: C.success, borderColor: C.success + '30' },
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

function HeroHeader() {
  const { activeConnection, tasks, memoryEntries } = useApp();
  const connected = !!activeConnection;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const unreadMemories = memoryEntries.filter((m) => m.reviewStatus === 'unread').length;

  return (
    <View style={styles.heroHeader}>
      <View style={styles.heroTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.heroTitle}>ClawCockpit</Text>
        </View>
        <View style={styles.heroRight}>
          <View style={[styles.heartbeatDot, connected ? styles.heartbeatActive : styles.heartbeatInactive]}>
            {connected ? (
              <PulsingDot color={C.success} size={10} />
            ) : (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.textTertiary }} />
            )}
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/chat');
            }}
            style={({ pressed }) => [styles.heroActionBtn, pressed && { opacity: 0.7 }]}
          >
            <LinearGradient colors={C.gradient.lobster} style={styles.heroActionGrad}>
              <Ionicons name="add" size={22} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {(activeTasks > 0 || unreadMemories > 0) && (
        <View style={styles.heroBadgeRow}>
          {activeTasks > 0 && (
            <Pressable style={styles.heroBadge} onPress={() => router.push('/(tabs)/tasks')}>
              <View style={[styles.heroBadgeDot, { backgroundColor: C.amber }]} />
              <Text style={styles.heroBadgeText}>{activeTasks} active</Text>
            </Pressable>
          )}
          {unreadMemories > 0 && (
            <Pressable style={styles.heroBadge} onPress={() => router.push('/(tabs)/memory')}>
              <View style={[styles.heroBadgeDot, { backgroundColor: C.coral }]} />
              <Text style={styles.heroBadgeText}>{unreadMemories} unread</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function KanbanProgressWidget() {
  const { tasks } = useApp();
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const inProg = tasks.filter((t) => t.status === 'in_progress').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const deferred = tasks.filter((t) => t.status === 'deferred').length;
  const total = tasks.length || 1;
  const pctDone = Math.round((done / total) * 100);

  const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done' && t.status !== 'archived');

  return (
    <Pressable onPress={() => router.push('/(tabs)/tasks')}>
      <LinearGradient
        colors={C.gradient.cardElevated}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.kanbanWidget}
      >
        <View style={styles.kanbanHeader}>
          <View style={styles.kanbanTitleRow}>
            <Ionicons name="albums" size={18} color={C.coral} />
            <Text style={styles.widgetTitle}>Task Pipeline</Text>
          </View>
          <View style={styles.kanbanPct}>
            <Text style={styles.kanbanPctText}>{pctDone}%</Text>
          </View>
        </View>

        <View style={styles.kanbanStats}>
          <View style={styles.kanbanStat}>
            <Text style={[styles.kanbanStatNum, { color: C.textSecondary }]}>{todo}</Text>
            <Text style={styles.kanbanStatLabel}>To Do</Text>
          </View>
          <View style={styles.kanbanStatDiv} />
          <View style={styles.kanbanStat}>
            <Text style={[styles.kanbanStatNum, { color: C.amber }]}>{inProg}</Text>
            <Text style={styles.kanbanStatLabel}>Active</Text>
          </View>
          <View style={styles.kanbanStatDiv} />
          <View style={styles.kanbanStat}>
            <Text style={[styles.kanbanStatNum, { color: C.success }]}>{done}</Text>
            <Text style={styles.kanbanStatLabel}>Done</Text>
          </View>
          <View style={styles.kanbanStatDiv} />
          <View style={styles.kanbanStat}>
            <Text style={[styles.kanbanStatNum, { color: C.purple }]}>{deferred}</Text>
            <Text style={styles.kanbanStatLabel}>Deferred</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          {done > 0 && <View style={[styles.progressSeg, { flex: done, backgroundColor: C.success }]} />}
          {inProg > 0 && <View style={[styles.progressSeg, { flex: inProg, backgroundColor: C.amber }]} />}
          {deferred > 0 && <View style={[styles.progressSeg, { flex: deferred, backgroundColor: C.purple }]} />}
          {todo > 0 && <View style={[styles.progressSeg, { flex: todo, backgroundColor: C.textTertiary + '60' }]} />}
        </View>

        {urgentTasks.length > 0 && (
          <View style={styles.urgentRow}>
            <Ionicons name="flame" size={14} color={C.primary} />
            <Text style={styles.urgentText} numberOfLines={1}>
              {urgentTasks[0].title}
            </Text>
            {urgentTasks.length > 1 && (
              <Text style={styles.urgentMore}>+{urgentTasks.length - 1}</Text>
            )}
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

function formatEventTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function CalendarAgendaWidget() {
  const { calendarEvents } = useApp();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayEnd = todayStart + 86400000;
  const now = Date.now();

  const todayEvents = useMemo(
    () =>
      calendarEvents
        .filter((e) => e.startTime >= todayStart && e.startTime < todayEnd)
        .sort((a, b) => a.startTime - b.startTime),
    [calendarEvents, todayStart, todayEnd],
  );

  const nextEvent = todayEvents.find((e) => e.endTime > now);
  const pastCount = todayEvents.filter((e) => e.endTime <= now).length;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <Pressable onPress={() => router.push('/calendar' as any)}>
      <View style={styles.calendarWidget}>
        <View style={styles.calendarWidgetLeft}>
          <View style={styles.calDateBox}>
            <Text style={styles.calDateDay}>{dayNames[today.getDay()]}</Text>
            <Text style={styles.calDateNum}>{today.getDate()}</Text>
            <Text style={styles.calDateMonth}>{monthNames[today.getMonth()]}</Text>
          </View>
        </View>
        <View style={styles.calendarWidgetRight}>
          <View style={styles.calWidgetHeader}>
            <Text style={styles.widgetTitle}>Today</Text>
            <Text style={styles.calEventCount}>{todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''}</Text>
          </View>

          {todayEvents.length === 0 ? (
            <View style={styles.calEmpty}>
              <Ionicons name="sunny-outline" size={18} color={C.textTertiary} />
              <Text style={styles.calEmptyText}>Clear schedule</Text>
            </View>
          ) : (
            <View style={styles.calEventsList}>
              {todayEvents.slice(0, 4).map((event, i) => {
                const isPast = event.endTime <= now;
                const isCurrent = event.startTime <= now && event.endTime > now;
                return (
                  <View key={event.id} style={[styles.calEventRow, isPast && styles.calEventPast]}>
                    <View style={[styles.calEventDot, { backgroundColor: event.color || C.coral }, isCurrent && styles.calEventDotCurrent]} />
                    <Text style={[styles.calEventTitle, isPast && styles.calEventTitlePast]} numberOfLines={1}>{event.title}</Text>
                    <Text style={[styles.calEventTime, isPast && styles.calEventTimePast]}>
                      {event.allDay ? 'All Day' : formatEventTime(event.startTime)}
                    </Text>
                  </View>
                );
              })}
              {todayEvents.length > 4 && (
                <Text style={styles.calMoreText}>+{todayEvents.length - 4} more</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function CRMHighlightsWidget() {
  const { crmContacts } = useApp();
  if (crmContacts.length === 0) return null;

  const recent = crmContacts
    .sort((a, b) => (b.lastInteraction || b.createdAt) - (a.lastInteraction || a.createdAt))
    .slice(0, 4);

  const stageColors: Record<string, string> = {
    lead: C.amber, prospect: C.accent, active: C.secondary, customer: C.coral, archived: C.textTertiary,
  };

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="people" size={16} color={C.secondary} />
          <Text style={styles.sectionTitle}>Contacts</Text>
        </View>
        <Pressable onPress={() => router.push('/crm' as any)}>
          <Text style={styles.seeAll}>See All</Text>
        </Pressable>
      </View>
      <View style={styles.crmGrid}>
        {recent.map((contact) => {
          const color = stageColors[contact.stage] || C.coral;
          const initials = contact.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
          return (
            <Pressable
              key={contact.id}
              style={styles.crmChip}
              onPress={() => router.push('/crm' as any)}
            >
              <View style={[styles.crmAvatar, { backgroundColor: color + '20' }]}>
                <Text style={[styles.crmAvatarText, { color }]}>{initials}</Text>
              </View>
              <Text style={styles.crmChipName} numberOfLines={1}>{contact.name.split(' ')[0]}</Text>
              <View style={[styles.crmStageLine, { backgroundColor: color }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DeferredPKMWidget() {
  const { memoryEntries } = useApp();
  const deferred = useMemo(
    () => memoryEntries.filter((m) => m.reviewStatus === 'deferred').slice(0, 3),
    [memoryEntries],
  );
  const unread = memoryEntries.filter((m) => m.reviewStatus === 'unread').length;

  if (deferred.length === 0 && unread === 0) return null;

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <MaterialCommunityIcons name="brain" size={16} color={C.purple} />
          <Text style={styles.sectionTitle}>Knowledge</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/memory')}>
          <Text style={styles.seeAll}>Review</Text>
        </Pressable>
      </View>

      {unread > 0 && (
        <Pressable
          style={styles.pkmUnreadBanner}
          onPress={() => router.push('/(tabs)/memory')}
        >
          <Ionicons name="sparkles" size={16} color={C.coral} />
          <Text style={styles.pkmUnreadText}>{unread} new item{unread !== 1 ? 's' : ''} to review</Text>
          <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
        </Pressable>
      )}

      {deferred.length > 0 && (
        <View style={styles.pkmDeferredList}>
          {deferred.map((mem) => (
            <Pressable key={mem.id} style={styles.pkmDeferredItem} onPress={() => router.push('/(tabs)/memory')}>
              <View style={[styles.pkmDeferredDot, { backgroundColor: C.purple }]} />
              <Text style={styles.pkmDeferredTitle} numberOfLines={1}>{mem.title}</Text>
              <Ionicons name="time" size={12} color={C.purple} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function AgentSkillsBar() {
  const { activeConnection } = useApp();
  if (!activeConnection) return null;

  const skills = [
    { name: 'Email', icon: 'mail', color: C.amber },
    { name: 'GitHub', icon: 'logo-github', color: '#fff' },
    { name: 'Calendar', icon: 'calendar', color: C.accent },
    { name: 'Shell', icon: 'terminal', color: C.secondary },
    { name: 'Web', icon: 'globe', color: C.purple },
  ];

  return (
    <View style={styles.skillsBar}>
      {skills.map((skill) => (
        <View key={skill.name} style={styles.skillItem}>
          <View style={[styles.skillIcon, { backgroundColor: skill.color + '12' }]}>
            <Ionicons name={skill.icon as any} size={14} color={skill.color} />
          </View>
          <Text style={styles.skillName}>{skill.name}</Text>
        </View>
      ))}
    </View>
  );
}

const QUICK_ACTIONS = [
  { id: '1', icon: 'calendar-outline', label: 'Calendar', color: C.amber, route: '/calendar' },
  { id: '2', icon: 'people-outline', label: 'Contacts', color: C.secondary, route: '/crm' },
  { id: '3', icon: 'mail-outline', label: 'Summarize\nInbox', color: C.coral, route: '/(tabs)/chat' },
  { id: '4', icon: 'git-branch-outline', label: 'Check\nGitHub', color: '#8B7FFF', route: '/(tabs)/chat' },
  { id: '5', icon: 'analytics-outline', label: 'System\nStatus', color: C.accent, route: '/(tabs)/chat' },
  { id: '6', icon: 'bulb-outline', label: 'Daily\nBrief', color: '#FF9F5A', route: '/(tabs)/chat' },
] as const;

function QuickActionsRow() {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="flash" size={16} color={C.coral} />
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
      </View>
      <FlatList
        data={QUICK_ACTIONS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.quickTile,
              pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push(item.route as any);
            }}
          >
            <View style={[styles.quickTileIcon, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon as any} size={22} color={item.color} />
            </View>
            <Text style={styles.quickTileLabel} numberOfLines={2}>{item.label}</Text>
          </Pressable>
        )}
        contentContainerStyle={styles.quickActionsScroll}
        scrollEnabled={true}
      />
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

function RecentActivityWidget() {
  const { conversations, tasks, memoryEntries } = useApp();

  const recentItems = useMemo(() => {
    const items: { icon: string; title: string; time: number; color: string; route: string }[] = [];

    for (const c of conversations.slice(0, 2)) {
      items.push({ icon: 'chatbubble-outline', title: c.title, time: c.lastMessageTime, color: C.coral, route: '/(tabs)/chat' });
    }
    for (const t of tasks.filter((t) => t.status !== 'archived').slice(0, 2)) {
      items.push({
        icon: 'checkbox-outline',
        title: t.title,
        time: t.updatedAt,
        color: t.priority === 'urgent' ? C.primary : t.priority === 'high' ? C.amber : C.secondary,
        route: '/(tabs)/tasks',
      });
    }
    for (const m of memoryEntries.slice(0, 2)) {
      items.push({ icon: 'document-text-outline', title: m.title, time: m.timestamp, color: C.accent, route: '/(tabs)/memory' });
    }

    items.sort((a, b) => b.time - a.time);
    return items.slice(0, 5);
  }, [conversations, tasks, memoryEntries]);

  if (recentItems.length === 0) return null;

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="time-outline" size={16} color={C.textSecondary} />
          <Text style={styles.sectionTitle}>Recent</Text>
        </View>
      </View>
      <View style={styles.recentList}>
        {recentItems.map((item, i) => (
          <Pressable
            key={i}
            style={styles.recentItem}
            onPress={() => router.push(item.route as any)}
          >
            <View style={[styles.recentIcon, { backgroundColor: item.color + '12' }]}>
              <Ionicons name={item.icon as any} size={14} color={item.color} />
            </View>
            <Text style={styles.recentTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.recentTime}>{formatTimeAgo(item.time)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const COMMAND_CHIPS = ['Inbox summary', "Today's brief", 'Check GitHub', 'System status', 'Upcoming meetings'];

function CommandBar() {
  const [commandText, setCommandText] = useState('');

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCommandText('');
    router.push('/(tabs)/chat');
  };

  return (
    <View style={styles.commandBarWrapper}>
      <View style={styles.commandBarInput}>
        <Ionicons name="sparkles" size={18} color={C.coral} />
        <TextInput
          style={styles.commandBarTextInput}
          placeholder="Ask your agent anything..."
          placeholderTextColor={C.textTertiary}
          value={commandText}
          onChangeText={setCommandText}
          onSubmitEditing={() => handleSend(commandText)}
          returnKeyType="send"
        />
        {commandText.length > 0 && (
          <Pressable onPress={() => handleSend(commandText)}>
            <LinearGradient colors={C.gradient.lobster} style={styles.commandBarSendBtn}>
              <Ionicons name="arrow-up" size={16} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.commandChipsScroll}>
        {COMMAND_CHIPS.map((chip) => (
          <Pressable
            key={chip}
            style={({ pressed }) => [styles.commandChip, pressed && { opacity: 0.7 }]}
            onPress={() => handleSend(chip)}
          >
            <Text style={styles.commandChipText}>{chip}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { refreshAll, activeConnection, tasks, memoryEntries } = useApp();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const dueToday = useMemo(() => {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return tasks.filter(
      (t) => t.dueDate && t.dueDate <= todayEnd.getTime() && t.status !== 'done' && t.status !== 'archived',
    );
  }, [tasks]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
      >
        <HeroHeader />

        <CommandBar />

        {!activeConnection && (
          <ProactiveAlert
            type="warn"
            icon="link"
            message="Connect to your OpenClaw gateway to unlock all features"
            onPress={() => router.push('/(tabs)/settings')}
          />
        )}

        {dueToday.length > 0 && (
          <ProactiveAlert
            type="info"
            icon="flame"
            message={`${dueToday.length} task${dueToday.length !== 1 ? 's' : ''} due today`}
            onPress={() => router.push('/(tabs)/tasks')}
          />
        )}

        <AgentSkillsBar />

        <KanbanProgressWidget />

        <CalendarAgendaWidget />

        <QuickActionsRow />

        <CRMHighlightsWidget />

        <DeferredPKMWidget />

        <RecentActivityWidget />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scrollContent: { paddingHorizontal: 20, gap: 16, paddingTop: 4 },
  heroHeader: { gap: 8 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: C.text },
  heroRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heartbeatDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heartbeatActive: { backgroundColor: C.successMuted },
  heartbeatInactive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  heroActionBtn: { borderRadius: 20, overflow: 'hidden' },
  heroActionGrad: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroBadgeRow: { flexDirection: 'row', gap: 8 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  heroBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary },

  alertCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1 },
  alertText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.text, flex: 1, lineHeight: 18 },

  skillsBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.borderLight },
  skillItem: { alignItems: 'center', gap: 4 },
  skillIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  skillName: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },

  kanbanWidget: { borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  kanbanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kanbanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  widgetTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text },
  kanbanPct: { backgroundColor: C.successMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  kanbanPctText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.success },
  kanbanStats: { flexDirection: 'row', alignItems: 'center' },
  kanbanStat: { flex: 1, alignItems: 'center' },
  kanbanStatNum: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  kanbanStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textSecondary, marginTop: 2 },
  kanbanStatDiv: { width: 1, height: 24, backgroundColor: C.border },
  progressTrack: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: C.border },
  progressSeg: { height: 4 },
  urgentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primaryMuted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  urgentText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.primary, flex: 1 },
  urgentMore: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: C.primary },

  calendarWidget: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' },
  calendarWidgetLeft: { width: 68, backgroundColor: C.coral + '10', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  calDateBox: { alignItems: 'center', gap: 1 },
  calDateDay: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.coral },
  calDateNum: { fontFamily: 'Inter_700Bold', fontSize: 28, color: C.text },
  calDateMonth: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.textSecondary },
  calendarWidgetRight: { flex: 1, padding: 12, gap: 8 },
  calWidgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calEventCount: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  calEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  calEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary },
  calEventsList: { gap: 4 },
  calEventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  calEventPast: { opacity: 0.5 },
  calEventDot: { width: 6, height: 6, borderRadius: 3 },
  calEventDotCurrent: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: C.text },
  calEventTitle: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.text, flex: 1 },
  calEventTitlePast: { textDecorationLine: 'line-through' },
  calEventTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  calEventTimePast: {},
  calMoreText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary, marginTop: 2 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text },
  seeAll: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.primary },

  quickActionsScroll: { gap: 10 },
  quickTile: { width: 78, alignItems: 'center', gap: 6 },
  quickTileIcon: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickTileLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.textSecondary, textAlign: 'center', lineHeight: 14 },

  crmGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  crmChip: { alignItems: 'center', gap: 6, width: 70 },
  crmAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  crmAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  crmChipName: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.textSecondary },
  crmStageLine: { width: 20, height: 2, borderRadius: 1 },

  pkmUnreadBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.coralMuted, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  pkmUnreadText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.coral, flex: 1 },
  pkmDeferredList: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' },
  pkmDeferredItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  pkmDeferredDot: { width: 6, height: 6, borderRadius: 3 },
  pkmDeferredTitle: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.text, flex: 1 },

  recentList: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' },
  recentItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  recentIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  recentTitle: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.text, flex: 1 },
  recentTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },

  commandBarWrapper: { gap: 10 },
  commandBarInput: { backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight, borderRadius: 14, paddingHorizontal: 14, height: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  commandBarTextInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, height: 48 },
  commandBarSendBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  commandChipsScroll: { gap: 0 },
  commandChip: { backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  commandChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary },
});
