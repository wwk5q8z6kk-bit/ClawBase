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
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { TaskStatus, Task } from '@/lib/types';

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
  const translateAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(translateAnim, { toValue: 0, duration: 400, delay, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, translateAnim, delay]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateAnim }] }}>
      {children}
    </Animated.View>
  );
}

function ProactiveAlert({ type, message, icon, onPress, priority = 'P2' }: { type: 'info' | 'warn' | 'success'; message: string; icon?: string; onPress: () => void; priority?: 'P1' | 'P2' | 'P3' }) {
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
      style={[styles.alertCard, { borderColor: config.borderColor }, priority === 'P1' && styles.alertP1]}
    >
      <Ionicons name={config.icon as any} size={20} color={config.iconColor} />
      <Text style={styles.alertText} numberOfLines={2}>{message}</Text>
      <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
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
  const { activeConnection, tasks, memoryEntries, gatewayStatus, gatewayInfo } = useApp();
  const connected = gatewayStatus === 'connected';
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const unreadMemories = memoryEntries.filter((m) => m.reviewStatus === 'unread').length;

  return (
    <View style={styles.heroHeader}>
      <View style={styles.heroTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.heroTitle}>Mission Control</Text>
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
              router.push('/(tabs)/settings' as any);
            }}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderLight }}>
              <Ionicons name="settings-outline" size={18} color={C.textSecondary} />
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
              <Ionicons name="add" size={22} color="#fff" />
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
    <Pressable onPress={() => router.push('/(tabs)/vault')}>
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
            <AnimatedPercentage target={pctDone} delay={500} />
          </View>
        </View>

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

  const nextEvent = todayEvents.find((e) => e.endTime > now);
  const pastCount = todayEvents.filter((e) => e.endTime <= now).length;

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
    <LinearGradient
      colors={C.gradient.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gatewayWidget}
    >
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
          {gatewayStatus === 'connecting' ? 'Establishing connection...' :
           gatewayStatus === 'authenticating' ? 'Verifying credentials...' :
           gatewayStatus === 'pairing' ? 'Approve on your gateway host' : 'Reconnecting...'}
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
    </LinearGradient>
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
      } catch {}
    };
    load();
  }, [gateway, gatewayStatus]);

  if (gatewayStatus !== 'connected') return null;

  return (
    <Pressable onPress={() => router.push('/(tabs)/settings')}>
      <LinearGradient
        colors={C.gradient.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.autoStatusWidget}
      >
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
      </LinearGradient>
    </Pressable>
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
  const { gatewayStatus, activeConnection } = useApp();
  const connected = gatewayStatus === 'connected';

  if (gatewayStatus === 'connecting') return <SkeletonLoader height={140} />;

  const cpuPct = connected ? 34 : 0;
  const memUsed = connected ? 6.2 : 0;
  const memTotal = connected ? 16 : 1;
  const memPct = connected ? Math.round((memUsed / memTotal) * 100) : 0;
  const diskPct = connected ? 47 : 0;
  const uptimeDays = connected ? 3 : 0;
  const uptimeHours = connected ? 12 : 0;

  const cpuColor = cpuPct < 50 ? C.success : cpuPct < 80 ? C.amber : C.error;
  const memColor = memPct < 50 ? C.success : memPct < 80 ? C.amber : C.error;
  const diskColor = diskPct < 50 ? C.success : diskPct < 80 ? C.amber : C.error;

  return (
    <View style={styles.systemHealthWidget}>
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

const WORKSTREAMS = [
  { id: 'email', icon: 'mail', label: 'Email', color: C.amber, status: '3 unread', activity: [3, 5, 2, 7, 4, 6, 3] },
  { id: 'github', icon: 'logo-github', label: 'GitHub', color: '#fff', status: '2 PRs open', activity: [1, 3, 6, 2, 5, 1, 4] },
  { id: 'research', icon: 'search', label: 'Research', color: C.accent, status: '5 papers', activity: [2, 4, 1, 3, 6, 2, 5] },
  { id: 'social', icon: 'people', label: 'Social', color: C.secondary, status: '12 mentions', activity: [4, 2, 5, 3, 7, 4, 2] },
] as const;

const WorkstreamCards = React.memo(function WorkstreamCards() {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="layers" size={16} color={C.purple} />
          <Text style={styles.sectionTitle}>Workstreams</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workstreamScroll}>
        {WORKSTREAMS.map((ws) => (
          <Pressable
            key={ws.id}
            style={({ pressed }) => [styles.workstreamCard, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/chat');
            }}
          >
            <View style={styles.workstreamCardTop}>
              <View style={[styles.workstreamIcon, { backgroundColor: ws.color + '15' }]}>
                <Ionicons name={ws.icon as any} size={16} color={ws.color} />
              </View>
              <Text style={styles.workstreamLabel}>{ws.label}</Text>
            </View>
            <Text style={styles.workstreamStatus}>{ws.status}</Text>
            <View style={styles.workstreamSparkline}>
              {ws.activity.map((val, i) => (
                <View
                  key={i}
                  style={[
                    styles.workstreamDot,
                    {
                      height: 3 + (val / 7) * 10,
                      backgroundColor: ws.color + (i === ws.activity.length - 1 ? 'FF' : '60'),
                    },
                  ]}
                />
              ))}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

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
  { id: '1', icon: 'calendar-outline', label: 'Calendar', color: C.amber, route: '/(tabs)/calendar' },
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
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push(item.route as any);
            }}
          >
            {({ pressed }) => (
              <View style={[styles.quickTile, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}>
                <View style={[styles.quickTileIcon, { backgroundColor: pressed ? item.color + '40' : item.color + '15' }]}>
                  <Ionicons name={item.icon as any} size={22} color={item.color} />
                </View>
                <Text style={styles.quickTileLabel} numberOfLines={2}>{item.label}</Text>
              </View>
            )}
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

const COMMAND_CHIPS = ['Add a task', 'Schedule event', 'Inbox summary', "Today's brief", 'Check GitHub'];

const PREFILL_CHIPS: Record<string, string> = {
  'Add a task': 'add task ',
  'Schedule event': 'schedule ',
};

function parsePriority(text: string): Task['priority'] {
  const lower = text.toLowerCase();
  if (lower.includes('urgent')) return 'urgent';
  if (lower.includes('high priority')) return 'high';
  if (lower.includes('low priority')) return 'low';
  return 'medium';
}

function getNextDayOfWeek(dayName: string): Date {
  const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const target = days[dayName.toLowerCase()];
  if (target === undefined) return new Date();
  const now = new Date();
  const current = now.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;
  const result = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 9, 0, 0, 0);
  return result;
}

function parseDueDate(text: string): number | undefined {
  const lower = text.toLowerCase();
  const now = new Date();
  if (lower.includes('by tomorrow') || lower.includes('tomorrow')) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
    return d.getTime();
  }
  if (lower.includes('by today') || lower.includes('today')) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
    return d.getTime();
  }
  const dayMatch = lower.match(/by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (dayMatch) return getNextDayOfWeek(dayMatch[1]).getTime();
  return undefined;
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
  const { createTask, createCalendarEvent } = useApp();
  const borderAnim = useRef(new Animated.Value(0)).current;

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
      const timer = setTimeout(() => setFeedbackMsg(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCommandText('');

    const lower = text.toLowerCase().trim();

    if (/^(add task|create task|todo|new task)\b/i.test(lower)) {
      const keyword = lower.match(/^(add task|create task|todo|new task)/i)?.[0] || '';
      let title = text.trim().slice(keyword.length).trim();
      const priority = parsePriority(title);
      title = stripKeywords(title, ['urgent', 'high priority', 'low priority', 'by tomorrow', 'by today', 'by monday', 'by tuesday', 'by wednesday', 'by thursday', 'by friday', 'by saturday', 'by sunday']);
      if (!title) title = 'New task';
      await createTask(title, 'todo' as TaskStatus, priority, undefined);
      setFeedbackMsg(`Task "${title}" created`);
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

      await createCalendarEvent({ title, startTime, endTime, color: C.coral, allDay: false });
      setFeedbackMsg(`Event "${title}" scheduled`);
      return;
    }

    if (lower.includes('tasks') || lower.includes('vault')) { router.push('/(tabs)/vault'); return; }
    if (lower.includes('calendar')) { router.push('/(tabs)/calendar'); return; }
    if (lower.includes('contacts')) { router.push('/crm' as any); return; }
    if (lower.includes('memory') || lower.includes('knowledge')) { router.push('/(tabs)/vault'); return; }
    if (lower.includes('settings') || lower.includes('automations')) { router.push('/(tabs)/settings'); return; }

    router.push('/(tabs)/chat');
  };

  const handleChipPress = (chip: string) => {
    if (PREFILL_CHIPS[chip]) {
      setCommandText(PREFILL_CHIPS[chip]);
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
          placeholder="Ask your agent anything..."
          placeholderTextColor={C.textTertiary}
          value={commandText}
          onChangeText={setCommandText}
          onSubmitEditing={() => handleSend(commandText)}
          onFocus={onFocusInput}
          onBlur={onBlurInput}
          returnKeyType="send"
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
        <View style={styles.feedbackToast}>
          <Ionicons name="checkmark-circle" size={16} color={C.success} />
          <Text style={styles.feedbackToastText}>{feedbackMsg}</Text>
        </View>
      )}
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { refreshAll, activeConnection, tasks, memoryEntries, gatewayStatus, gatewayInfo, gatewaySessions, fetchGatewaySessions } = useApp();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    fetchGatewaySessions().catch(() => {});
    setRefreshing(false);
  }, [refreshAll, fetchGatewaySessions]);

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
              priority="P2"
            />
          </FadeInWidget>
        )}

        {dueToday.length > 0 && (
          <FadeInWidget delay={100}>
            <ProactiveAlert
              type="info"
              icon="flame"
              message={`${dueToday.length} task${dueToday.length !== 1 ? 's' : ''} due today`}
              onPress={() => router.push('/(tabs)/vault')}
              priority={dueToday.length >= 3 ? 'P1' : 'P2'}
            />
          </FadeInWidget>
        )}

        <FadeInWidget delay={100}>
          <SystemHealthWidget />
        </FadeInWidget>

        <FadeInWidget delay={200}>
          <AgentSkillsBar />
        </FadeInWidget>

        <FadeInWidget delay={300}>
          <GatewayStatusWidget />
        </FadeInWidget>

        <FadeInWidget delay={400}>
          <AutomationStatusWidget />
        </FadeInWidget>

        <FadeInWidget delay={500}>
          <KanbanProgressWidget />
        </FadeInWidget>

        <FadeInWidget delay={600}>
          <CalendarAgendaWidget />
        </FadeInWidget>

        <FadeInWidget delay={700}>
          <QuickActionsRow />
        </FadeInWidget>

        <FadeInWidget delay={800}>
          <WorkstreamCards />
        </FadeInWidget>

        <FadeInWidget delay={900}>
          <CRMHighlightsWidget />
        </FadeInWidget>

        <FadeInWidget delay={1000}>
          <DeferredPKMWidget />
        </FadeInWidget>

        <FadeInWidget delay={1100}>
          <RecentActivityWidget />
        </FadeInWidget>
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

  systemHealthWidget: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.borderLight, gap: 12 },
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
});
