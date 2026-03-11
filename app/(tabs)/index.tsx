import React, { useCallback, useEffect, useRef, useMemo, useState, type ReactNode } from 'react';
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
import { Card } from '@/components/Card';
import { PressableCard } from '@/components/PressableCard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { PulsingDot } from '@/components/PulsingDot';
import type { TaskStatus, Task } from '@/lib/types';
import { generateInsights, generateLinkSuggestions, type Insight, type InlineAction, type LinkSuggestion } from '@/lib/insights';
import { getAllLinks, addLink, getDismissedInsights, dismissInsight, type EntityLink, type EntityType } from '@/lib/entityLinks';

const C = Colors.dark;

function AnimatedCounter({ target, delay = 0, style }: { target: number; delay?: number; style?: any }) {
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    countAnim.setValue(0);
    const listener = countAnim.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });

    const animation = Animated.timing(countAnim, {
      toValue: target,
      duration: 600,
      delay,
      useNativeDriver: false,
    });
    animation.start();

    return () => {
      countAnim.removeListener(listener);
      animation.stop();
    };
  }, [target, delay, countAnim]);

  return <Text style={style}>{displayValue}</Text>;
}

function AnimatedPercentage({ target, delay = 0 }: { target: number; delay?: number }) {
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    countAnim.setValue(0);
    const listener = countAnim.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });

    const animation = Animated.timing(countAnim, {
      toValue: target,
      duration: 600,
      delay,
      useNativeDriver: false,
    });
    animation.start();

    return () => {
      countAnim.removeListener(listener);
      animation.stop();
    };
  }, [target, delay, countAnim]);

  return <Text style={styles.kanbanPctText}>{displayValue}%</Text>;
}



function SkeletonLoader({ height = 120 }: { height?: number }) {
  const shimmerAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 0.6, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(shimmerAnim, { toValue: 0.3, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  return (
    <Animated.View style={{ backgroundColor: C.card, borderRadius: 16, padding: 16, height, justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: C.borderLight, opacity: shimmerAnim }}>
      <View style={{ width: '60%', height: 12, borderRadius: 6, backgroundColor: C.cardElevated }} />
      <View style={{ width: '40%', height: 12, borderRadius: 6, backgroundColor: C.cardElevated }} />
      <View style={{ width: '80%', height: 12, borderRadius: 6, backgroundColor: C.cardElevated }} />
    </Animated.View>
  );
}

function FadeInWidget({ delay, children }: { delay: number; children: ReactNode }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(translateAnim, { toValue: 0, delay, useNativeDriver: Platform.OS !== 'web', tension: 60, friction: 9 }),
      Animated.spring(scaleAnim, { toValue: 1, delay, useNativeDriver: Platform.OS !== 'web', tension: 60, friction: 9 }),
    ]).start();
  }, [fadeAnim, translateAnim, scaleAnim, delay]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateAnim }, { scale: scaleAnim }] }}>
      {children}
    </Animated.View>
  );
}

function ScalePressable({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: any }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: Platform.OS !== 'web',
      tension: 300,
      friction: 10,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
      tension: 200,
      friction: 8,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

function AnimatedProgressBar({ segments, total }: { segments: { value: number; color: string }[]; total: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: 1,
      duration: 800,
      delay: 300,
      useNativeDriver: false,
    }).start();
  }, [widthAnim]);

  const safeTotal = total || 1;

  return (
    <View style={styles.progressTrack}>
      {segments.map((seg, i) => {
        if (seg.value <= 0) return null;
        return (
          <Animated.View
            key={i}
            style={[
              styles.progressSeg,
              {
                flex: seg.value,
                backgroundColor: seg.color,
                opacity: widthAnim,
                transform: [{ scaleX: widthAnim }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function ProactiveAlert({ type, message, icon, onPress, priority = 'P2', inlineActions, onInlineAction, onDismiss }: { type: 'info' | 'warn' | 'success'; message: string; icon?: string; onPress: () => void; priority?: 'P1' | 'P2' | 'P3'; inlineActions?: InlineAction[]; onInlineAction?: (action: InlineAction) => void; onDismiss?: () => void }) {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (priority === 'P1') {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      );
      glow.start();
      return () => glow.stop();
    }
  }, [priority, glowAnim]);

  const configs = {
    info: { icon: icon || 'information-circle', colors: C.gradient.alertInfo, iconColor: C.accent, borderColor: C.accent + '30' },
    warn: { icon: icon || 'warning', colors: C.gradient.alertWarn, iconColor: C.amber, borderColor: C.amber + '30' },
    success: { icon: icon || 'checkmark-circle', colors: C.gradient.alertSuccess, iconColor: C.success, borderColor: C.success + '30' },
  };
  const config = configs[type];

  const opacityStyle = priority === 'P3' ? { opacity: 0.7 } : {};
  const glowOpacity = priority === 'P1' ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }) : undefined;

  const content = (
    <LinearGradient
      colors={config.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.alertCard, { borderColor: config.borderColor }, priority === 'P1' && styles.alertP1, inlineActions && inlineActions.length > 0 && { paddingBottom: 10 }]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name={config.icon as any} size={20} color={config.iconColor} />
          <Text style={[styles.alertText, { flex: 1 }]} numberOfLines={2}>{message}</Text>
          {onDismiss ? (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onDismiss(); }}
              hitSlop={8}
              style={({ pressed }) => [{ padding: 2 }, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="close" size={16} color={C.textTertiary} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
          )}
        </View>
        {inlineActions && inlineActions.length > 0 && onInlineAction && (
          <View style={{ flexDirection: 'row', gap: 6, marginLeft: 30 }}>
            {inlineActions.map((action, i) => (
              <Pressable
                key={i}
                onPress={(e) => { e.stopPropagation?.(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onInlineAction(action); }}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                }, pressed && { opacity: 0.6, backgroundColor: 'rgba(255,255,255,0.15)' }]}
              >
                <Ionicons name={action.icon as any} size={12} color={config.iconColor} />
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: config.iconColor }} numberOfLines={1}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </LinearGradient>
  );

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.8 }, opacityStyle]}>
      {priority === 'P1' ? (
        <Animated.View style={{ opacity: glowOpacity }}>
          {content}
        </Animated.View>
      ) : content}
    </Pressable>
  );
}

function HeroHeader() {
  const { tasks, memoryEntries, gatewayStatus } = useApp();
  const connected = gatewayStatus === 'connected';

  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const unreadMemories = memoryEntries.filter((m) => m.reviewStatus === 'unread').length;

  return (
    <View style={styles.heroHeader}>
      <View style={styles.heroTopRow}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.heroTitle}>ClawBase</Text>
          <View style={[styles.heartbeatDot, connected ? styles.heartbeatActive : styles.heartbeatInactive]}>
            {connected ? (
              <PulsingDot color={C.success} size={7} />
            ) : (
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.textTertiary }} />
            )}
          </View>
        </View>
        <View style={styles.heroRight}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/search' as any);
            }}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <View style={styles.heroIconBtn}>
              <Ionicons name="search" size={17} color={C.textSecondary} />
            </View>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/chat');
            }}
            style={({ pressed }) => [styles.heroActionBtn, pressed && { opacity: 0.7 }]}
          >
            <LinearGradient colors={C.gradient.lobster} style={styles.heroActionGrad}>
              <Ionicons name="add" size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {(activeTasks > 0 || unreadMemories > 0) && (
        <View style={styles.heroBadgeRow}>
          {activeTasks > 0 && (
            <Pressable style={styles.heroBadge} onPress={() => router.push('/(tabs)/vault')}>
              <View style={[styles.heroBadgeDot, { backgroundColor: C.amber }]} />
              <Text style={styles.heroBadgeText}>{activeTasks} active</Text>
            </Pressable>
          )}
          {unreadMemories > 0 && (
            <Pressable style={styles.heroBadge} onPress={() => router.push('/(tabs)/vault')}>
              <View style={[styles.heroBadgeDot, { backgroundColor: C.coral }]} />
              <Text style={styles.heroBadgeText}>{unreadMemories} unread</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const KanbanProgressWidget = React.memo(function KanbanProgressWidget() {
  const { tasks } = useApp();
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const inProg = tasks.filter((t) => t.status === 'in_progress').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const deferred = tasks.filter((t) => t.status === 'deferred').length;
  const total = tasks.length || 1;
  const pctDone = Math.round((done / total) * 100);

  const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done' && t.status !== 'archived');

  return (
    <PressableCard
      variant="cardElevated"
      onPress={() => router.push('/(tabs)/vault')}
      style={styles.kanbanWidget}
    >
      <LinearGradient
        colors={C.gradient.lobster}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.widgetGradientAccent}
      />
      <View style={styles.kanbanHeader}>
        <View style={styles.kanbanTitleRow}>
          <Ionicons name="albums" size={18} color={C.coral} />
          <Text style={styles.widgetTitle}>Task Pipeline</Text>
        </View>
        <View style={styles.kanbanPct}>
          <AnimatedPercentage target={pctDone} delay={500} />
        </View>
      </View>

      <ScalePressable onPress={() => router.push('/(tabs)/tasks')}>
        <View style={styles.kanbanStats}>
          <View style={styles.kanbanStat}>
            <AnimatedCounter target={todo} delay={0} style={[styles.kanbanStatNum, { color: C.textSecondary }]} />
            <Text style={styles.kanbanStatLabel}>To Do</Text>
          </View>
          <View style={styles.kanbanStatDiv} />
          <View style={styles.kanbanStat}>
            <AnimatedCounter target={inProg} delay={100} style={[styles.kanbanStatNum, { color: C.amber }]} />
            <Text style={styles.kanbanStatLabel}>Active</Text>
          </View>
          <View style={styles.kanbanStatDiv} />
          <View style={styles.kanbanStat}>
            <AnimatedCounter target={done} delay={200} style={[styles.kanbanStatNum, { color: C.success }]} />
            <Text style={styles.kanbanStatLabel}>Done</Text>
          </View>
          <View style={styles.kanbanStatDiv} />
          <View style={styles.kanbanStat}>
            <AnimatedCounter target={deferred} delay={300} style={[styles.kanbanStatNum, { color: C.purple }]} />
            <Text style={styles.kanbanStatLabel}>Deferred</Text>
          </View>
        </View>
      </ScalePressable>

      <AnimatedProgressBar
        segments={[
          { value: done, color: C.success },
          { value: inProg, color: C.amber },
          { value: deferred, color: C.purple },
          { value: todo, color: C.textTertiary + '60' },
        ]}
        total={total}
      />

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
    </PressableCard>
  );
});

function formatEventTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

const CalendarAgendaWidget = React.memo(function CalendarAgendaWidget() {
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

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <Pressable onPress={() => router.push('/(tabs)/calendar')}>
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
});

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
        <Pressable onPress={() => router.push('/(tabs)/vault')}>
          <Text style={styles.seeAll}>Review</Text>
        </Pressable>
      </View>

      {unread > 0 && (
        <Pressable
          style={styles.pkmUnreadBanner}
          onPress={() => router.push('/(tabs)/vault')}
        >
          <Ionicons name="sparkles" size={16} color={C.coral} />
          <Text style={styles.pkmUnreadText}>{unread} new item{unread !== 1 ? 's' : ''} to review</Text>
          <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
        </Pressable>
      )}

      {deferred.length > 0 && (
        <View style={styles.pkmDeferredList}>
          {deferred.map((mem) => (
            <Pressable key={mem.id} style={styles.pkmDeferredItem} onPress={() => router.push('/(tabs)/vault')}>
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

function KnowledgeGraphWidget({ links }: { links: EntityLink[] }) {
  const { tasks, memoryEntries, calendarEvents, crmContacts, conversations } = useApp();

  const stats = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    const relationCounts: Record<string, number> = {};
    const entityConnections: Record<string, number> = {};

    for (const link of links) {
      const sKey = `${link.sourceType}:${link.sourceId}`;
      const tKey = `${link.targetType}:${link.targetId}`;
      entityConnections[sKey] = (entityConnections[sKey] || 0) + 1;
      entityConnections[tKey] = (entityConnections[tKey] || 0) + 1;

      typeCounts[link.sourceType] = (typeCounts[link.sourceType] || 0) + 1;
      typeCounts[link.targetType] = (typeCounts[link.targetType] || 0) + 1;

      relationCounts[link.relation] = (relationCounts[link.relation] || 0) + 1;
    }

    let mostConnectedKey = '';
    let mostConnectedCount = 0;
    for (const [key, count] of Object.entries(entityConnections)) {
      if (count > mostConnectedCount) {
        mostConnectedKey = key;
        mostConnectedCount = count;
      }
    }

    let mostConnectedName = '';
    if (mostConnectedKey) {
      const [type, id] = mostConnectedKey.split(':');
      if (type === 'task') mostConnectedName = tasks.find(t => t.id === id)?.title || 'Task';
      else if (type === 'memory') mostConnectedName = memoryEntries.find(m => m.id === id)?.title || 'Memory';
      else if (type === 'contact') mostConnectedName = crmContacts.find(c => c.id === id)?.name || 'Contact';
      else if (type === 'calendar') mostConnectedName = calendarEvents.find(e => e.id === id)?.title || 'Event';
      else if (type === 'conversation') mostConnectedName = conversations.find(c => c.id === id)?.title || 'Chat';
    }

    const uniqueEntities = new Set<string>();
    for (const link of links) {
      uniqueEntities.add(`${link.sourceType}:${link.sourceId}`);
      uniqueEntities.add(`${link.targetType}:${link.targetId}`);
    }

    return {
      totalLinks: links.length,
      connectedEntities: uniqueEntities.size,
      typeCounts,
      relationCounts,
      mostConnectedName,
      mostConnectedCount,
    };
  }, [links, tasks, memoryEntries, calendarEvents, crmContacts, conversations]);

  if (stats.totalLinks === 0) return null;

  const typeEntries = [
    { type: 'memory', icon: 'book', color: C.purple, label: 'Memory' },
    { type: 'task', icon: 'checkmark-circle', color: C.amber, label: 'Tasks' },
    { type: 'calendar', icon: 'calendar', color: C.coral, label: 'Events' },
    { type: 'contact', icon: 'person', color: C.secondary, label: 'Contacts' },
    { type: 'conversation', icon: 'chatbubbles', color: C.accent, label: 'Chats' },
  ].filter(t => (stats.typeCounts[t.type] || 0) > 0);

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <MaterialCommunityIcons name="graph-outline" size={16} color={C.accent} />
          <Text style={styles.sectionTitle}>Knowledge Graph</Text>
        </View>
        <Pressable onPress={() => router.push('/connections' as any)}>
          <Text style={styles.seeAll}>Explore</Text>
        </Pressable>
      </View>

      <View style={kgStyles.statsRow}>
        <View style={kgStyles.statBox}>
          <Text style={kgStyles.statValue}>{stats.totalLinks}</Text>
          <Text style={kgStyles.statLabel}>Connections</Text>
        </View>
        <View style={[kgStyles.statDivider]} />
        <View style={kgStyles.statBox}>
          <Text style={kgStyles.statValue}>{stats.connectedEntities}</Text>
          <Text style={kgStyles.statLabel}>Linked Items</Text>
        </View>
        <View style={[kgStyles.statDivider]} />
        <View style={kgStyles.statBox}>
          <Text style={kgStyles.statValue}>{typeEntries.length}</Text>
          <Text style={kgStyles.statLabel}>Entity Types</Text>
        </View>
      </View>

      <View style={kgStyles.typeRow}>
        {typeEntries.map(t => (
          <View key={t.type} style={kgStyles.typeChip}>
            <Ionicons name={t.icon as any} size={12} color={t.color} />
            <Text style={[kgStyles.typeLabel, { color: t.color }]}>{stats.typeCounts[t.type]}</Text>
          </View>
        ))}
      </View>

      {Object.keys(stats.relationCounts).length > 0 && (
        <View style={kgStyles.relationRow}>
          {[
            { key: 'created_from', label: 'Created', icon: 'git-branch-outline' },
            { key: 'mentions', label: 'Mentions', icon: 'at-outline' },
            { key: 'related_to', label: 'Related', icon: 'link-outline' },
            { key: 'spawned_by', label: 'Spawned', icon: 'flash-outline' },
          ].filter(r => (stats.relationCounts[r.key] || 0) > 0).map(r => (
            <View key={r.key} style={kgStyles.relationChip}>
              <Ionicons name={r.icon as any} size={10} color={C.textSecondary} />
              <Text style={kgStyles.relationLabel}>{r.label}</Text>
              <Text style={kgStyles.relationCount}>{stats.relationCounts[r.key]}</Text>
            </View>
          ))}
        </View>
      )}

      {stats.mostConnectedName ? (
        <View style={kgStyles.hubRow}>
          <MaterialCommunityIcons name="hub-outline" size={14} color={C.textSecondary} />
          <Text style={kgStyles.hubText} numberOfLines={1}>
            Hub: <Text style={{ color: C.text }}>{stats.mostConnectedName}</Text> ({stats.mostConnectedCount} links)
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const kgStyles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: C.text },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  statDivider: { width: 1, height: 28, backgroundColor: C.border, marginHorizontal: 4 },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  typeLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  relationRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  relationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  relationLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
  relationCount: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: C.textSecondary },
  hubRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingHorizontal: 4,
  },
  hubText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, flex: 1 },
});

const SUGGESTION_TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  task: { icon: 'checkmark-circle', color: '#FFB020' },
  memory: { icon: 'book', color: '#8B7FFF' },
  calendar: { icon: 'calendar', color: '#FF7B5C' },
  contact: { icon: 'person', color: '#9CA3AF' },
  conversation: { icon: 'chatbubbles', color: '#5B7FFF' },
};

function LinkSuggestionsWidget({ suggestions, onAccept }: { suggestions: LinkSuggestion[]; onAccept: (s: LinkSuggestion) => void }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = suggestions.filter(s => !dismissed.has(s.id));
  if (visible.length === 0) return null;

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="git-merge" size={16} color={C.purple} />
          <Text style={styles.sectionTitle}>Suggested Links</Text>
        </View>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary }}>{visible.length} found</Text>
      </View>
      {visible.slice(0, 3).map(s => {
        const srcCfg = SUGGESTION_TYPE_CONFIG[s.sourceType] || SUGGESTION_TYPE_CONFIG.task;
        const tgtCfg = SUGGESTION_TYPE_CONFIG[s.targetType] || SUGGESTION_TYPE_CONFIG.task;
        return (
          <View key={s.id} style={lsStyles.card}>
            <View style={lsStyles.entities}>
              <View style={lsStyles.entityRow}>
                <Ionicons name={srcCfg.icon as any} size={13} color={srcCfg.color} />
                <Text style={[lsStyles.entityName, { color: srcCfg.color }]} numberOfLines={1}>{s.sourceName}</Text>
              </View>
              <View style={lsStyles.arrow}>
                <Ionicons name="link" size={12} color={C.textTertiary} />
              </View>
              <View style={lsStyles.entityRow}>
                <Ionicons name={tgtCfg.icon as any} size={13} color={tgtCfg.color} />
                <Text style={[lsStyles.entityName, { color: tgtCfg.color }]} numberOfLines={1}>{s.targetName}</Text>
              </View>
            </View>
            <Text style={lsStyles.reason}>{s.reason}</Text>
            <View style={lsStyles.actions}>
              <Pressable
                onPress={() => { onAccept(s); setDismissed(prev => new Set(prev).add(s.id)); }}
                style={({ pressed }) => [lsStyles.acceptBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="checkmark" size={14} color={C.success} />
                <Text style={lsStyles.acceptText}>Link</Text>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDismissed(prev => new Set(prev).add(s.id)); }}
                style={({ pressed }) => [lsStyles.dismissBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="close" size={14} color={C.textTertiary} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const lsStyles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  entities: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  entityName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    flex: 1,
  },
  arrow: {
    paddingHorizontal: 4,
  },
  reason: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
    marginLeft: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  acceptText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.success,
  },
  dismissBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});

function GatewayStatusWidget() {
  const { gatewayStatus, gatewayInfo, gatewaySessions, activeConnection } = useApp();
  if (!activeConnection) return null;

  if (gatewayStatus === 'connecting') return <SkeletonLoader height={130} />;

  const statusConfig: Record<string, { color: string; label: string; icon: string }> = {
    connected: { color: C.success, label: 'Connected', icon: 'checkmark-circle' },
    connecting: { color: C.amber, label: 'Connecting...', icon: 'sync-circle' },
    authenticating: { color: C.amber, label: 'Authenticating...', icon: 'key' },
    pairing: { color: C.accent, label: 'Pairing...', icon: 'link' },
    error: { color: C.error, label: 'Error', icon: 'alert-circle' },
    disconnected: { color: C.textTertiary, label: 'Disconnected', icon: 'cloud-offline' },
  };

  const config = statusConfig[gatewayStatus] || statusConfig.disconnected;
  const channelCount = gatewayInfo.channels.filter((c) => c.status === 'active').length;

  return (
    <Card variant="card" style={styles.gatewayWidget}>
      <View style={[styles.widgetAccentLine, { backgroundColor: C.coral }]} />
      <View style={styles.gatewayHeader}>
        <View style={styles.gatewayTitleRow}>
          <Ionicons name="server" size={16} color={C.coral} />
          <Text style={styles.widgetTitle}>Gateway</Text>
        </View>
        <View style={[styles.gatewayStatusBadge, { backgroundColor: config.color + '20' }]}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: config.color }} />
          <Text style={[styles.gatewayStatusText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>

      {gatewayStatus === 'connected' && (
        <ScalePressable onPress={() => router.push('/sessions' as any)}>
          <View style={styles.gatewayStats}>
            <View style={styles.gatewayStat}>
              <Ionicons name="chatbubbles-outline" size={16} color={C.secondary} />
              <Text style={styles.gatewayStatNum}>{gatewaySessions.length}</Text>
              <Text style={styles.gatewayStatLabel}>Sessions</Text>
            </View>
            <View style={styles.gatewayStatDiv} />
            <View style={styles.gatewayStat}>
              <Ionicons name="radio-outline" size={16} color={C.accent} />
              <Text style={styles.gatewayStatNum}>{channelCount}</Text>
              <Text style={styles.gatewayStatLabel}>Channels</Text>
            </View>
            <View style={styles.gatewayStatDiv} />
            <View style={styles.gatewayStat}>
              <Ionicons name="hardware-chip-outline" size={16} color={C.amber} />
              <Text style={styles.gatewayStatNum}>{gatewayInfo.model ? '1' : '0'}</Text>
              <Text style={styles.gatewayStatLabel}>Model</Text>
            </View>
          </View>
        </ScalePressable>
      )}

      {gatewayStatus === 'connected' && gatewayInfo.channels.length > 0 && (
        <View style={styles.gatewayChannels}>
          {gatewayInfo.channels.slice(0, 5).map((ch) => {
            const iconMap: Record<string, string> = {
              whatsapp: 'logo-whatsapp',
              telegram: 'paper-plane',
              discord: 'logo-discord',
              slack: 'chatbox',
              imessage: 'chatbubble-ellipses',
              signal: 'shield-checkmark',
              webchat: 'globe',
            };
            return (
              <View key={ch.type} style={styles.gatewayChannelChip}>
                <Ionicons name={(iconMap[ch.type] || 'radio') as any} size={12} color={ch.status === 'active' ? C.secondary : C.textTertiary} />
                <Text style={[styles.gatewayChannelText, { color: ch.status === 'active' ? C.text : C.textTertiary }]}>{ch.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {gatewayStatus !== 'connected' && gatewayStatus !== 'disconnected' && (
        <Text style={styles.gatewaySubText}>
          {gatewayStatus === 'authenticating'
            ? 'Verifying credentials...'
            : gatewayStatus === 'pairing'
              ? 'Approve on your gateway host'
              : 'Connection error. Retrying...'}
        </Text>
      )}

      {gatewayInfo.model && gatewayStatus === 'connected' && (
        <View style={styles.gatewayModelRow}>
          <Ionicons name="sparkles" size={12} color={C.coral} />
          <Text style={styles.gatewayModelText}>{gatewayInfo.model}</Text>
          {gatewayInfo.agentName && (
            <Text style={styles.gatewayAgentName}>· {gatewayInfo.agentName}</Text>
          )}
        </View>
      )}
    </Card>
  );
}

function AutomationStatusWidget() {
  const { gateway, gatewayStatus } = useApp();
  const [autoCount, setAutoCount] = useState({ enabled: 0, paused: 0, approvals: 0 });

  useEffect(() => {
    if (gatewayStatus !== 'connected') return;
    const load = async () => {
      try {
        const autos = await gateway.fetchAutomations();
        const approvals = await gateway.fetchApprovals();
        if (Array.isArray(autos)) {
          setAutoCount({
            enabled: autos.filter((a: any) => a.enabled).length,
            paused: autos.filter((a: any) => !a.enabled).length,
            approvals: Array.isArray(approvals) ? approvals.length : 0,
          });
        }
      } catch { }
    };
    load();
  }, [gateway, gatewayStatus]);

  if (gatewayStatus !== 'connected') return null;

  return (
    <PressableCard
      variant="card"
      onPress={() => router.push('/(tabs)/settings')}
      style={styles.autoStatusWidget}
    >
      <View style={[styles.widgetAccentLine, { backgroundColor: C.amber }]} />
      <View style={styles.autoStatusHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="flash" size={16} color={C.amber} />
          <Text style={styles.widgetTitle}>Automations</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
      </View>
      <View style={styles.autoStatusRow}>
        <View style={styles.autoStatusItem}>
          <View style={[styles.autoStatusDot, { backgroundColor: C.success }]} />
          <Text style={styles.autoStatusNum}>{autoCount.enabled}</Text>
          <Text style={styles.autoStatusLabel}>Running</Text>
        </View>
        <View style={styles.autoStatusDiv} />
        <View style={styles.autoStatusItem}>
          <View style={[styles.autoStatusDot, { backgroundColor: C.textTertiary }]} />
          <Text style={styles.autoStatusNum}>{autoCount.paused}</Text>
          <Text style={styles.autoStatusLabel}>Paused</Text>
        </View>
        {autoCount.approvals > 0 && (
          <>
            <View style={styles.autoStatusDiv} />
            <View style={styles.autoStatusItem}>
              <View style={[styles.autoStatusDot, { backgroundColor: C.primary }]} />
              <Text style={[styles.autoStatusNum, { color: C.primary }]}>{autoCount.approvals}</Text>
              <Text style={[styles.autoStatusLabel, { color: C.primary }]}>Pending</Text>
            </View>
          </>
        )}
      </View>
    </PressableCard>
  );
}

function CircularRing({ percent, size, color, trackColor }: { percent: number; size: number; color: string; trackColor: string }) {
  const clampedPct = Math.min(100, Math.max(0, percent));
  const rotation = `${(clampedPct / 100) * 360 - 90}deg`;
  const halfSize = size / 2;
  const strokeWidth = 4;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size, borderRadius: halfSize, borderWidth: strokeWidth, borderColor: trackColor, position: 'absolute' }} />
      <View style={{ width: size, height: size, position: 'absolute', overflow: 'hidden' }}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-start' }}>
          <View style={{
            width: strokeWidth + 2,
            height: halfSize,
            backgroundColor: color,
            borderRadius: (strokeWidth + 2) / 2,
            position: 'absolute',
            top: 0,
            transform: [{ translateY: halfSize / 2 }, { rotate: rotation }, { translateY: -halfSize / 2 }],
            transformOrigin: 'center',
          }} />
        </View>
      </View>
      {clampedPct > 0 && (
        <View style={{
          position: 'absolute',
          width: strokeWidth + 2,
          height: halfSize,
          top: 0,
          left: halfSize - (strokeWidth + 2) / 2,
          overflow: 'hidden',
        }}>
          <View style={{
            width: strokeWidth + 2,
            height: strokeWidth + 2,
            borderRadius: (strokeWidth + 2) / 2,
            backgroundColor: color,
          }} />
        </View>
      )}
      <View style={{
        position: 'absolute',
        width: size - strokeWidth * 4,
        height: size - strokeWidth * 4,
        borderRadius: (size - strokeWidth * 4) / 2,
        borderWidth: strokeWidth,
        borderColor: 'transparent',
        borderTopColor: color,
        borderRightColor: clampedPct > 25 ? color : 'transparent',
        borderBottomColor: clampedPct > 50 ? color : 'transparent',
        borderLeftColor: clampedPct > 75 ? color : 'transparent',
        transform: [{ rotate: '-45deg' }],
      }} />
    </View>
  );
}

const SystemHealthWidget = React.memo(function SystemHealthWidget() {
  const { gateway, gatewayStatus } = useApp();
  const connected = gatewayStatus === 'connected';
  const [health, setHealth] = useState<{
    cpu: number; memUsed: number; memTotal: number; diskPercent: number; uptimeMs: number;
  } | null>(null);

  useEffect(() => {
    if (!connected) { setHealth(null); return; }
    gateway.fetchSystemHealth().then((data) => {
      setHealth(data);
    });
  }, [gateway, connected]);

  if (gatewayStatus === 'connecting') return <SkeletonLoader height={140} />;

  const cpuPct = health?.cpu ?? 0;
  const memUsed = health?.memUsed ?? 0;
  const memTotal = health?.memTotal ?? 16;
  const memPct = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
  const diskPct = health?.diskPercent ?? 0;
  const totalMs = health?.uptimeMs ?? 0;
  const uptimeDays = Math.floor(totalMs / 86400000);
  const uptimeHours = Math.floor((totalMs % 86400000) / 3600000);

  const cpuColor = cpuPct < 50 ? C.success : cpuPct < 80 ? C.amber : C.error;
  const memColor = memPct < 50 ? C.success : memPct < 80 ? C.amber : C.error;
  const diskColor = diskPct < 50 ? C.success : diskPct < 80 ? C.amber : C.error;

  return (
    <View style={styles.systemHealthWidget}>
      <View style={styles.widgetAccentLine} />
      <View style={styles.systemHealthHeader}>
        <View style={styles.systemHealthTitleRow}>
          <Ionicons name="pulse" size={16} color={C.accent} />
          <Text style={styles.widgetTitle}>System Health</Text>
          {connected && <PulsingDot color={C.success} size={6} />}
        </View>
      </View>

      {!connected ? (
        <View style={styles.systemHealthPlaceholder}>
          <Ionicons name="cloud-offline-outline" size={20} color={C.textTertiary} />
          <Text style={styles.systemHealthPlaceholderText}>Connect to view system health</Text>
        </View>
      ) : (
        <View style={styles.systemHealthMetrics}>
          <View style={styles.systemHealthMetric}>
            <CircularRing percent={cpuPct} size={44} color={cpuColor} trackColor={C.border} />
            <Text style={[styles.systemHealthValue, { color: cpuColor }]}>{cpuPct}%</Text>
            <Text style={styles.systemHealthLabel}>CPU</Text>
          </View>
          <View style={styles.systemHealthMetric}>
            <CircularRing percent={memPct} size={44} color={memColor} trackColor={C.border} />
            <Text style={[styles.systemHealthValue, { color: memColor }]}>{memUsed.toFixed(1)} GB</Text>
            <Text style={styles.systemHealthLabel}>Memory</Text>
          </View>
          <View style={styles.systemHealthMetric}>
            <CircularRing percent={diskPct} size={44} color={diskColor} trackColor={C.border} />
            <Text style={[styles.systemHealthValue, { color: diskColor }]}>{diskPct}%</Text>
            <Text style={styles.systemHealthLabel}>Disk</Text>
          </View>
          <View style={styles.systemHealthMetric}>
            <View style={styles.systemHealthUptimeRing}>
              <Ionicons name="time-outline" size={20} color={C.purple} />
            </View>
            <Text style={[styles.systemHealthValue, { color: C.purple }]}>{uptimeDays}d {uptimeHours}h</Text>
            <Text style={styles.systemHealthLabel}>Uptime</Text>
          </View>
        </View>
      )}
    </View>
  );
});

const DEFAULT_WORKSTREAMS = [
  { id: 'email', icon: 'mail', label: 'Email', color: C.amber, status: 'No data', sessionCount: 0, recentActivity: [0, 0, 0, 0, 0, 0, 0], type: 'email' },
  { id: 'github', icon: 'logo-github', label: 'GitHub', color: '#fff', status: 'No data', sessionCount: 0, recentActivity: [0, 0, 0, 0, 0, 0, 0], type: 'github' },
  { id: 'research', icon: 'search', label: 'Research', color: C.accent, status: 'No data', sessionCount: 0, recentActivity: [0, 0, 0, 0, 0, 0, 0], type: 'research' },
  { id: 'social', icon: 'people', label: 'Social', color: C.secondary, status: 'No data', sessionCount: 0, recentActivity: [0, 0, 0, 0, 0, 0, 0], type: 'social' },
];

const WorkstreamCards = React.memo(function WorkstreamCards() {
  const { gateway, gatewayStatus } = useApp();
  const connected = gatewayStatus === 'connected';
  const [workstreams, setWorkstreams] = useState<{
    id: string; label: string; type: string; status: string;
    sessionCount: number; recentActivity: number[];
    icon?: string; color?: string;
  }[]>(DEFAULT_WORKSTREAMS);

  useEffect(() => {
    if (!connected) { setWorkstreams(DEFAULT_WORKSTREAMS); return; }
    gateway.fetchWorkstreams().then((data) => {
      if (data.length > 0) {
        setWorkstreams(data);
      }
    });
  }, [gateway, connected]);

  const channelIcons: Record<string, { icon: string; color: string }> = {
    whatsapp: { icon: 'logo-whatsapp', color: '#25D366' },
    telegram: { icon: 'paper-plane', color: '#0088cc' },
    discord: { icon: 'logo-discord', color: '#5865F2' },
    slack: { icon: 'chatbubble-ellipses', color: '#E01E5A' },
    email: { icon: 'mail', color: '#FF9F5A' },
    github: { icon: 'logo-github', color: '#ffffff' },
    webchat: { icon: 'globe', color: '#00D4FF' },
    imessage: { icon: 'chatbubble', color: '#34C759' },
    signal: { icon: 'shield-checkmark', color: '#3A76F0' },
    main: { icon: 'terminal', color: C.accent },
    dm: { icon: 'chatbubbles', color: C.accent },
    direct: { icon: 'chatbubbles', color: C.accent },
    research: { icon: 'search', color: C.accent },
    social: { icon: 'people', color: C.secondary },
  };

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="layers" size={16} color={C.purple} />
          <Text style={styles.sectionTitle}>Workstreams</Text>
          {connected && <PulsingDot color={C.success} size={6} />}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workstreamScroll}>
        {workstreams.map((ws) => {
          const iconInfo = channelIcons[ws.type] || channelIcons[ws.id] || { icon: 'layers', color: C.purple };
          const icon = (ws as any).icon || iconInfo.icon;
          const color = (ws as any).color || iconInfo.color;
          const maxVal = Math.max(...ws.recentActivity, 1);

          return (
            <Pressable
              key={ws.id}
              style={({ pressed }) => [styles.workstreamCard, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/chat');
              }}
            >
              <View style={styles.workstreamCardTop}>
                <View style={[styles.workstreamIcon, { backgroundColor: color + '15' }]}>
                  <Ionicons name={icon as any} size={16} color={color} />
                </View>
                <Text style={styles.workstreamLabel}>{ws.label}</Text>
              </View>
              <Text style={styles.workstreamStatus}>{ws.status}</Text>
              <View style={styles.workstreamSparkline}>
                {ws.recentActivity.map((val, i) => (
                  <View
                    key={i}
                    style={[
                      styles.workstreamDot,
                      {
                        height: 3 + (val / maxVal) * 10,
                        backgroundColor: color + (i === ws.recentActivity.length - 1 ? 'FF' : '60'),
                      },
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

function AgentSkillsBar() {
  const { activeConnection, gatewayInfo } = useApp();
  if (!activeConnection) return null;

  const SKILL_META: Record<string, { icon: string; color: string }> = {
    email: { icon: 'mail', color: C.amber },
    github: { icon: 'logo-github', color: '#fff' },
    calendar: { icon: 'calendar', color: C.accent },
    shell: { icon: 'terminal', color: C.secondary },
    web: { icon: 'globe', color: C.purple },
    search: { icon: 'search', color: C.accent },
    memory: { icon: 'brain', color: C.coral },
    whatsapp: { icon: 'logo-whatsapp', color: '#25D366' },
    telegram: { icon: 'paper-plane', color: '#0088cc' },
    discord: { icon: 'logo-discord', color: '#5865F2' },
    slack: { icon: 'chatbubble-ellipses', color: '#E01E5A' },
    code: { icon: 'code-slash', color: C.secondary },
    files: { icon: 'folder', color: C.amber },
    notes: { icon: 'document-text', color: C.coral },
  };

  const skills = (gatewayInfo.skills && gatewayInfo.skills.length > 0)
    ? gatewayInfo.skills.map((s: string) => {
      const key = s.toLowerCase();
      const meta = SKILL_META[key] || { icon: 'extension-puzzle', color: C.textSecondary };
      return { name: s.charAt(0).toUpperCase() + s.slice(1), icon: meta.icon, color: meta.color };
    })
    : [
      { name: 'Email', icon: 'mail', color: C.amber },
      { name: 'GitHub', icon: 'logo-github', color: '#fff' },
      { name: 'Calendar', icon: 'calendar', color: C.accent },
      { name: 'Shell', icon: 'terminal', color: C.secondary },
      { name: 'Web', icon: 'globe', color: C.purple },
    ];

  return (
    <View style={styles.skillsBar}>
      {skills.slice(0, 6).map((skill) => (
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

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  color: string;
  route?: string;
  gatewayCommand?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: '0', icon: 'timer-outline', label: 'Focus', color: C.primary, route: '/focus' },
  { id: '1', icon: 'calendar-outline', label: 'Calendar', color: C.amber, route: '/(tabs)/calendar' },
  { id: '2', icon: 'people-outline', label: 'Contacts', color: C.secondary, route: '/crm' },
  { id: '3', icon: 'mail-outline', label: 'Summarize\nInbox', color: C.coral, gatewayCommand: 'inbox-summary' },
  { id: '4', icon: 'git-branch-outline', label: 'Check\nGitHub', color: '#8B7FFF', gatewayCommand: 'github-status' },
  { id: '5', icon: 'analytics-outline', label: 'System\nStatus', color: C.accent, gatewayCommand: 'health-check' },
  { id: '6', icon: 'bulb-outline', label: 'Daily\nBrief', color: '#FF9F5A', gatewayCommand: 'daily-brief' },
];

function QuickActionsRow() {
  const { gateway, gatewayStatus } = useApp();
  const connected = gatewayStatus === 'connected';
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAction = useCallback(async (action: QuickAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (action.route && !action.gatewayCommand) {
      router.push(action.route as any);
      return;
    }

    if (action.gatewayCommand && connected) {
      setLoadingId(action.id);
      try {
        await gateway.invokeCommand(action.gatewayCommand);
      } catch { }
      setLoadingId(null);
      return;
    }

    // Fallback: navigate to chat
    router.push('/(tabs)/chat');
  }, [gateway, connected]);

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
        renderItem={({ item }) => {
          const isLoading = loadingId === item.id;
          return (
            <Pressable
              onPress={() => handleAction(item)}
              disabled={isLoading}
            >
              {({ pressed }) => (
                <View style={[styles.quickTile, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}>
                  <View style={[styles.quickTileIcon, { backgroundColor: pressed ? item.color + '40' : item.color + '15' }, isLoading && { opacity: 0.5 }]}>
                    <Ionicons name={item.icon as any} size={22} color={item.color} />
                  </View>
                  <Text style={styles.quickTileLabel} numberOfLines={2}>{item.label}</Text>
                </View>
              )}
            </Pressable>
          );
        }}
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

const RecentActivityWidget = React.memo(function RecentActivityWidget() {
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
        route: '/(tabs)/vault',
      });
    }
    for (const m of memoryEntries.slice(0, 2)) {
      items.push({ icon: 'document-text-outline', title: m.title, time: m.timestamp, color: C.accent, route: '/(tabs)/vault' });
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
});

const COMMAND_CHIPS = ['Add a task', 'Schedule event', 'Focus timer', 'New mind map', 'Inbox summary', "Today's brief", 'Check GitHub'];

const PREFILL_CHIPS: Record<string, string> = {
  'Add a task': 'add task ',
  'Schedule event': 'schedule ',
  'New mind map': 'new mindmap ',
  'Focus timer': '__navigate:/focus',
};

function parsePriority(text: string): Task['priority'] {
  const lower = text.toLowerCase();
  if (lower.includes('urgent')) return 'urgent';
  if (lower.includes('high priority')) return 'high';
  if (lower.includes('low priority')) return 'low';
  return 'medium';
}

function parseEventDate(text: string): Date {
  const lower = text.toLowerCase();
  const now = new Date();
  if (lower.includes('tomorrow')) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseTime(text: string): { hour: number; minute: number } | null {
  const match = text.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function stripKeywords(text: string, keywords: string[]): string {
  let result = text;
  for (const kw of keywords) {
    result = result.replace(new RegExp(kw, 'gi'), '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function CommandBar() {
  const [commandText, setCommandText] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { createTask, createCalendarEvent, gateway, gatewayStatus } = useApp();
  const borderAnim = useRef(new Animated.Value(0)).current;
  const connected = gatewayStatus === 'connected';

  const onFocusInput = () => {
    Animated.timing(borderAnim, { toValue: 1, duration: 250, useNativeDriver: false }).start();
  };

  const onBlurInput = () => {
    Animated.timing(borderAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
  };

  const animatedBorderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.borderLight, C.coral],
  });

  useEffect(() => {
    if (feedbackMsg) {
      const timer = setTimeout(() => setFeedbackMsg(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  const GATEWAY_COMMANDS: Record<string, { command: string; label: string }> = {
    'inbox summary': { command: 'inbox-summary', label: 'Inbox summary' },
    'summarize inbox': { command: 'inbox-summary', label: 'Inbox summary' },
    'check github': { command: 'github-status', label: 'GitHub status' },
    'github status': { command: 'github-status', label: 'GitHub status' },
    "today's brief": { command: 'daily-brief', label: 'Daily brief' },
    'daily brief': { command: 'daily-brief', label: 'Daily brief' },
    'system status': { command: 'health-check', label: 'Health check' },
    'health check': { command: 'health-check', label: 'Health check' },
    'sync memory': { command: 'sync-memory', label: 'Memory sync' },
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCommandText('');

    const lower = text.toLowerCase().trim();

    // Local: create task
    if (/^(add task|create task|todo|new task)\b/i.test(lower)) {
      const keyword = lower.match(/^(add task|create task|todo|new task)/i)?.[0] || '';
      let title = text.trim().slice(keyword.length).trim();
      const priority = parsePriority(title);
      title = stripKeywords(title, ['urgent', 'high priority', 'low priority', 'by tomorrow', 'by today', 'by monday', 'by tuesday', 'by wednesday', 'by thursday', 'by friday', 'by saturday', 'by sunday']);
      if (!title) title = 'New task';
      await createTask(title, 'todo' as TaskStatus, priority, undefined, { source: 'chat' });
      setFeedbackMsg(`✓ Task "${title}" created`);
      return;
    }

    if (/^(new mindmap|create mindmap|new mind map|create mind map|mindmap)\b/i.test(lower)) {
      const keyword = lower.match(/^(new mindmap|create mindmap|new mind map|create mind map|mindmap)/i)?.[0] || '';
      let title = text.trim().slice(keyword.length).trim();
      if (!title) title = 'Untitled Mind Map';
      (async () => {
        try {
          const { createMindMap } = await import('@/lib/mindmap');
          const map = await createMindMap(title);
          router.push({ pathname: '/mindmap', params: { id: map.id } } as any);
          setFeedbackMsg(`Mind map "${title}" created`);
        } catch {
          setFeedbackMsg('Failed to create mind map');
        }
      })();
      return;
    }

    if (/^(add event|schedule|new event|meeting)\b/i.test(lower)) {
      const keyword = lower.match(/^(add event|schedule|new event|meeting)/i)?.[0] || '';
      let title = text.trim().slice(keyword.length).trim();
      const eventDate = parseEventDate(title);
      const timeParsed = parseTime(title);
      title = stripKeywords(title, ['tomorrow', 'today']);
      const timePattern = /at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i;
      title = title.replace(timePattern, '').replace(/\s+/g, ' ').trim();
      if (!title) title = 'New event';

      const hour = timeParsed?.hour ?? 9;
      const minute = timeParsed?.minute ?? 0;
      const startTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), hour, minute, 0, 0).getTime();
      const endTime = startTime + 3600000;

      await createCalendarEvent({ title, startTime, endTime, color: C.coral, allDay: false, source: 'manual', tags: ['from:chat'] });
      setFeedbackMsg(`✓ Event "${title}" scheduled`);
      return;
    }

    // Gateway command: match known patterns
    const gwMatch = Object.entries(GATEWAY_COMMANDS).find(([pattern]) => lower.includes(pattern));
    if (gwMatch && connected) {
      const [, { command, label }] = gwMatch;
      setIsLoading(true);
      setFeedbackMsg(`⏳ Running ${label}...`);
      try {
        const result = await gateway.invokeCommand(command);
        const summary = typeof result === 'string' ? result :
          result?.message || result?.summary || result?.output || `${label} completed`;
        setFeedbackMsg(`✓ ${typeof summary === 'string' ? summary.slice(0, 100) : label + ' done'}`);
      } catch {
        setFeedbackMsg(`✗ ${label} failed — check gateway connection`);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Navigation shortcuts
    if (lower.includes('focus') || lower.includes('pomodoro') || lower.includes('timer')) { router.push('/focus' as any); return; }
    if (lower.includes('tasks') || lower.includes('vault')) { router.push('/(tabs)/vault'); return; }
    if (lower.includes('calendar')) { router.push('/(tabs)/calendar'); return; }
    if (lower.includes('contacts')) { router.push('/crm' as any); return; }
    if (lower.includes('memory') || lower.includes('knowledge')) { router.push('/(tabs)/vault'); return; }
    if (lower.includes('settings') || lower.includes('automations')) { router.push('/(tabs)/settings'); return; }
    if (lower.includes('mindmap') || lower.includes('mind map')) { router.push('/(tabs)/vault'); return; }

    // Fallback: open chat with the message as the prompt
    router.push('/(tabs)/chat');
  };

  const handleChipPress = (chip: string) => {
    const prefill = PREFILL_CHIPS[chip];
    if (prefill && prefill.startsWith('__navigate:')) {
      router.push(prefill.replace('__navigate:', '') as any);
    } else if (prefill) {
      setCommandText(prefill);
    } else {
      handleSend(chip);
    }
  };

  return (
    <View style={styles.commandBarWrapper}>
      <Animated.View style={[styles.commandBarInput, { borderColor: animatedBorderColor }]}>
        <Ionicons name="sparkles" size={18} color={C.coral} />
        <TextInput
          style={styles.commandBarTextInput}
          placeholder={connected ? 'Ask your agent anything...' : 'Create tasks, events, or navigate...'}
          placeholderTextColor={C.textTertiary}
          value={commandText}
          onChangeText={setCommandText}
          onSubmitEditing={() => handleSend(commandText)}
          onFocus={onFocusInput}
          onBlur={onBlurInput}
          returnKeyType="send"
          editable={!isLoading}
        />
        {commandText.length > 0 && (
          <Pressable onPress={() => handleSend(commandText)}>
            <LinearGradient colors={C.gradient.lobster} style={styles.commandBarSendBtn}>
              <Ionicons name="arrow-up" size={16} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}
      </Animated.View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.commandChipsScroll}>
        {COMMAND_CHIPS.map((chip) => (
          <Pressable
            key={chip}
            style={({ pressed }) => [styles.commandChip, pressed && { opacity: 0.7 }]}
            onPress={() => handleChipPress(chip)}
          >
            <Text style={styles.commandChipText}>{chip}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {feedbackMsg && (
        <View style={[styles.feedbackToast, isLoading && { backgroundColor: C.card }]}>
          {isLoading ? (
            <Ionicons name="hourglass" size={16} color={C.amber} />
          ) : feedbackMsg.startsWith('✗') ? (
            <Ionicons name="close-circle" size={16} color={C.error} />
          ) : (
            <Ionicons name="checkmark-circle" size={16} color={C.success} />
          )}
          <Text style={[
            styles.feedbackToastText,
            isLoading && { color: C.amber },
            feedbackMsg.startsWith('✗') && { color: C.error },
          ]} numberOfLines={2}>{feedbackMsg}</Text>
        </View>
      )}
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { refreshAll, activeConnection, tasks, memoryEntries, calendarEvents, crmContacts, fetchGatewaySessions, updateTask, addCRMInteraction, updateMemoryEntry } = useApp();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showAllInsights, setShowAllInsights] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    fetchGatewaySessions().catch(() => { });
    setRefreshing(false);
  }, [refreshAll, fetchGatewaySessions]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const [entityLinks, setEntityLinks] = useState<EntityLink[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAllLinks().then(setEntityLinks).catch(() => {});
    getDismissedInsights().then(setDismissedIds).catch(() => {});
    const interval = setInterval(() => {
      getAllLinks().then(setEntityLinks).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDismissInsight = useCallback(async (insightId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissedIds(prev => new Set(prev).add(insightId));
    await dismissInsight(insightId);
  }, []);

  const allInsights = useMemo(
    () => generateInsights({ tasks, memoryEntries, calendarEvents, crmContacts, entityLinks }),
    [tasks, memoryEntries, calendarEvents, crmContacts, entityLinks],
  );

  const insights = useMemo(
    () => allInsights.filter(i => !dismissedIds.has(i.id)),
    [allInsights, dismissedIds],
  );

  const insightTypeToAlertType = (insight: Insight): 'info' | 'warn' | 'success' => {
    if (insight.priority === 'P1') return 'warn';
    if (insight.category === 'streak') return 'success';
    return 'info';
  };

  const linkSuggestions = useMemo(
    () => generateLinkSuggestions({ tasks, memoryEntries, calendarEvents, crmContacts, existingLinks: entityLinks }),
    [tasks, memoryEntries, calendarEvents, crmContacts, entityLinks],
  );

  const handleInlineAction = useCallback(async (action: InlineAction) => {
    if (action.type === 'complete_task' && action.entityId) {
      await updateTask(action.entityId, { status: 'done' as TaskStatus });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (action.type === 'log_interaction' && action.entityId) {
      await addCRMInteraction(action.entityId, { type: 'note', notes: 'Quick check-in logged from dashboard' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (action.type === 'review_memory' && action.entityId) {
      await updateMemoryEntry(action.entityId, { reviewStatus: 'reviewed' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (action.type === 'create_task') {
      router.push('/(tabs)/vault');
    }
  }, [updateTask, addCRMInteraction, updateMemoryEntry]);

  const [acceptedSuggestionIds, setAcceptedSuggestionIds] = useState<Set<string>>(new Set());

  const handleAcceptSuggestion = useCallback(async (suggestion: LinkSuggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAcceptedSuggestionIds(prev => new Set(prev).add(suggestion.id));
    await addLink(suggestion.sourceType as EntityType, suggestion.sourceId, suggestion.targetType as EntityType, suggestion.targetId, 'related_to');
    getAllLinks().then(setEntityLinks).catch(() => {});
  }, []);

  const visibleInsights = showAllInsights ? insights : insights.slice(0, 3);
  const hasMoreInsights = insights.length > 3;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
      >
        <HeroHeader />

        <FadeInWidget delay={0}>
          <CommandBar />
        </FadeInWidget>

        {!activeConnection && (
          <FadeInWidget delay={50}>
            <ProactiveAlert
              type="warn"
              icon="link"
              message="Connect to your OpenClaw gateway to unlock all features"
              onPress={() => router.push('/(tabs)/settings')}
              priority="P1"
            />
          </FadeInWidget>
        )}

        {visibleInsights.map((insight, idx) => (
          <FadeInWidget key={insight.id} delay={50 + idx * 50}>
            <ProactiveAlert
              type={insightTypeToAlertType(insight)}
              icon={insight.icon}
              message={`${insight.title} — ${insight.message}`}
              onPress={() => router.push(insight.actionRoute as any)}
              priority={insight.priority}
              inlineActions={insight.inlineActions}
              onInlineAction={handleInlineAction}
              onDismiss={() => handleDismissInsight(insight.id)}
            />
          </FadeInWidget>
        ))}

        {hasMoreInsights && !showAllInsights && (
          <FadeInWidget delay={200}>
            <Pressable
              onPress={() => setShowAllInsights(true)}
              style={({ pressed }) => [styles.viewAllInsights, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.viewAllInsightsText}>
                View {insights.length - 3} more insight{insights.length - 3 > 1 ? 's' : ''}
              </Text>
              <Ionicons name="chevron-down" size={14} color={C.accent} />
            </Pressable>
          </FadeInWidget>
        )}

        <FadeInWidget delay={100}>
          <KanbanProgressWidget />
        </FadeInWidget>

        <FadeInWidget delay={150}>
          <CalendarAgendaWidget />
        </FadeInWidget>

        <FadeInWidget delay={200}>
          <QuickActionsRow />
        </FadeInWidget>

        <FadeInWidget delay={250}>
          <SystemHealthWidget />
        </FadeInWidget>

        <FadeInWidget delay={300}>
          <RecentActivityWidget />
        </FadeInWidget>

        <FadeInWidget delay={350}>
          <CRMHighlightsWidget />
        </FadeInWidget>

        <FadeInWidget delay={400}>
          <DeferredPKMWidget />
        </FadeInWidget>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scrollContent: { paddingHorizontal: 20, gap: 16, paddingTop: 4 },
  heroHeader: { gap: 4 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: C.text },
  heroRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderLight },
  heartbeatDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heartbeatActive: { backgroundColor: C.successMuted },
  heartbeatInactive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  heroActionBtn: { borderRadius: 17, overflow: 'hidden' },
  heroActionGrad: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  heroBadgeRow: { flexDirection: 'row', gap: 8 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  heroBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary },

  alertCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1 },
  alertText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.text, flex: 1, lineHeight: 18 },

  skillsBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.borderLight, borderTopWidth: 2, borderTopColor: C.coral + '40' },
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

  calendarWidget: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' as const, borderLeftWidth: 3, borderLeftColor: C.coral },
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
  feedbackToast: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.successMuted, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  feedbackToastText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.success },
  gatewayWidget: { borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  gatewayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gatewayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gatewayStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  gatewayStatusText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  gatewayStats: { flexDirection: 'row', alignItems: 'center' },
  gatewayStat: { flex: 1, alignItems: 'center', gap: 2 },
  gatewayStatNum: { fontFamily: 'Inter_700Bold', fontSize: 20, color: C.text },
  gatewayStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textSecondary },
  gatewayStatDiv: { width: 1, height: 24, backgroundColor: C.border },
  gatewayChannels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gatewayChannelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  gatewayChannelText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  gatewaySubText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary },
  gatewayModelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gatewayModelText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.text },
  gatewayAgentName: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary },

  alertP1: { ...C.shadow.glow },

  autoStatusWidget: { borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  autoStatusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  autoStatusRow: { flexDirection: 'row', alignItems: 'center' },
  autoStatusItem: { flex: 1, alignItems: 'center', gap: 2 },
  autoStatusDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  autoStatusNum: { fontFamily: 'Inter_700Bold', fontSize: 20, color: C.text },
  autoStatusLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textSecondary },
  autoStatusDiv: { width: 1, height: 24, backgroundColor: C.border },

  widgetAccentLine: { height: 3, borderRadius: 2, backgroundColor: C.accent, marginBottom: 4, width: 40 },
  widgetGradientAccent: { height: 3, borderRadius: 2, marginBottom: 4, width: 50 },
  systemHealthWidget: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.borderLight, gap: 12, overflow: 'hidden' as const },
  systemHealthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  systemHealthTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  systemHealthPlaceholder: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  systemHealthPlaceholderText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary },
  systemHealthMetrics: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  systemHealthMetric: { alignItems: 'center', gap: 4 },
  systemHealthValue: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  systemHealthLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
  systemHealthUptimeRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 4, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  workstreamScroll: { gap: 10 },
  workstreamCard: { width: 130, backgroundColor: C.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.borderLight, gap: 8 },
  workstreamCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  workstreamIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  workstreamLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.text },
  workstreamStatus: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textSecondary },
  workstreamSparkline: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 14 },
  workstreamDot: { width: 4, borderRadius: 2 },

  viewAllInsights: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, borderWidth: 1, borderColor: C.borderLight },
  viewAllInsightsText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.accent },
});
