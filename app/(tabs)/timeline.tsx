import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  SectionList,
  ScrollView,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { getAllLinks, type EntityLink } from '@/lib/entityLinks';

const C = Colors.dark;

type EventType = 'alert' | 'action' | 'job' | 'error' | 'info' | 'chat';
type EntityFilter = 'all' | 'task' | 'memory' | 'calendar' | 'contact' | 'conversation';

interface TimelineEvent {
  id: string;
  type: EventType;
  description: string;
  source: string;
  timestamp: number;
  raw?: string;
  entityType?: string;
  entityId?: string;
}

const EVENT_CONFIG: Record<EventType, { icon: string; color: string; label: string }> = {
  alert: { icon: 'flame', color: C.primary, label: 'Alert' },
  action: { icon: 'checkmark-circle', color: C.secondary, label: 'Action' },
  job: { icon: 'briefcase', color: C.accent, label: 'Job' },
  error: { icon: 'close-circle', color: C.error, label: 'Error' },
  info: { icon: 'information-circle', color: C.textSecondary, label: 'Info' },
  chat: { icon: 'chatbubble', color: C.coral, label: 'Chat' },
};

const ENTITY_FILTERS: { key: EntityFilter; label: string; icon: string; color: string }[] = [
  { key: 'all', label: 'All', icon: 'layers-outline', color: C.text },
  { key: 'task', label: 'Tasks', icon: 'checkmark-circle-outline', color: C.amber },
  { key: 'memory', label: 'Memories', icon: 'book-outline', color: '#8B7FFF' },
  { key: 'calendar', label: 'Events', icon: 'calendar-outline', color: C.coral },
  { key: 'contact', label: 'CRM', icon: 'person-outline', color: C.accent },
  { key: 'conversation', label: 'Chats', icon: 'chatbubble-outline', color: C.secondary },
];

const FILTERS: { key: string; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: C.text },
  { key: 'alert', label: 'Alerts', color: C.primary },
  { key: 'action', label: 'Actions', color: C.secondary },
  { key: 'job', label: 'Jobs', color: C.accent },
  { key: 'error', label: 'Errors', color: C.error },
];

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function TimelineItem({
  item,
  isLast,
  expanded,
  onToggle,
  connCount,
}: {
  item: TimelineEvent;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  connCount: number;
}) {
  const config = EVENT_CONFIG[item.type] || EVENT_CONFIG.info;

  return (
    <View style={styles.timelineRow}>
      <View style={styles.railCol}>
        <View style={[styles.railDot, { backgroundColor: config.color }]} />
        {!isLast && <View style={[styles.railLine, { backgroundColor: config.color + '30' }]} />}
      </View>
      <Pressable
        style={({ pressed }) => [styles.eventCard, pressed && { opacity: 0.85 }]}
        onPress={() => {
          Haptics.selectionAsync();
          onToggle();
        }}
      >
        <Card
          variant="card"
          style={[styles.eventCardInner, { borderLeftWidth: 3, borderLeftColor: config.color + '60' }]}
        >
          <View style={styles.eventHeader}>
            <View style={[styles.eventBadge, { backgroundColor: config.color + '18' }]}>
              <Ionicons name={config.icon as any} size={12} color={config.color} />
              <Text style={[styles.eventBadgeText, { color: config.color }]}>{config.label}</Text>
            </View>
            {connCount > 0 && (
              <View style={styles.connBadge}>
                <Ionicons name="git-network-outline" size={10} color={C.accent} />
                <Text style={styles.connBadgeText}>{connCount}</Text>
              </View>
            )}
            <Text style={styles.eventTime}>{formatTimeAgo(item.timestamp)}</Text>
          </View>
          <Text style={styles.eventDescription} numberOfLines={expanded ? undefined : 2}>
            {item.description}
          </Text>
          <View style={styles.eventFooter}>
            <View style={styles.sourceChip}>
              <Ionicons
                name={getSourceIcon(item.source)}
                size={11}
                color={C.textTertiary}
              />
              <Text style={styles.sourceText}>{item.source}</Text>
            </View>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={C.textTertiary}
            />
          </View>
          {expanded && item.raw && (
            <View style={styles.rawBlock}>
              <Text style={styles.rawText}>{item.raw}</Text>
            </View>
          )}
        </Card>
      </Pressable>
    </View>
  );
}

function getSourceIcon(source: string): any {
  const map: Record<string, string> = {
    github: 'logo-github',
    email: 'mail',
    cron: 'time',
    chat: 'chatbubble',
    system: 'settings',
    calendar: 'calendar',
    agent: 'flash',
  };
  return map[source] || 'ellipse';
}



function formatDayHeader(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function getEntityIcon(entityType?: string): { icon: string; color: string } {
  switch (entityType) {
    case 'task': return { icon: 'checkmark-circle-outline', color: C.amber };
    case 'memory': return { icon: 'book-outline', color: '#8B7FFF' };
    case 'calendar': return { icon: 'calendar-outline', color: C.coral };
    case 'contact': return { icon: 'person-outline', color: C.accent };
    case 'conversation': return { icon: 'chatbubble-outline', color: C.secondary };
    default: return { icon: 'ellipse-outline', color: C.textTertiary };
  }
}

export default function TimelineScreen() {
  const insets = useSafeAreaInsets();
  const { conversations, tasks, memoryEntries, calendarEvents, crmContacts, gateway, gatewayStatus } = useApp();
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [gatewayEvents, setGatewayEvents] = useState<TimelineEvent[]>([]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const [linkCounts, setLinkCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getAllLinks().then(links => {
      const counts: Record<string, number> = {};
      for (const link of links) {
        const sKey = `${link.sourceType}:${link.sourceId}`;
        const tKey = `${link.targetType}:${link.targetId}`;
        counts[sKey] = (counts[sKey] || 0) + 1;
        counts[tKey] = (counts[tKey] || 0) + 1;
      }
      setLinkCounts(counts);
    }).catch((e) => console.warn('[Timeline] Failed to load entity links:', e));
  }, [conversations, tasks, memoryEntries]);

  const localEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    for (const c of conversations) {
      events.push({
        id: `chat-${c.id}`,
        type: 'chat',
        description: c.lastMessage || `Conversation: ${c.title}`,
        source: 'chat',
        timestamp: c.lastMessageTime || Date.now(),
        raw: JSON.stringify({ id: c.id, title: c.title, messages: c.messageCount }, null, 2),
        entityType: 'conversation',
        entityId: c.id,
      });
    }

    for (const t of tasks) {
      const type: EventType =
        t.status === 'done' ? 'action' :
          t.priority === 'urgent' ? 'alert' :
            t.status === 'in_progress' ? 'job' : 'info';
      events.push({
        id: `task-${t.id}`,
        type,
        description: `${t.status === 'done' ? 'Completed' : t.status === 'in_progress' ? 'Working on' : 'Task'}: ${t.title}`,
        source: t.source || 'system',
        timestamp: t.updatedAt,
        raw: JSON.stringify({ id: t.id, status: t.status, priority: t.priority, tags: t.tags }, null, 2),
        entityType: 'task',
        entityId: t.id,
      });
    }

    for (const m of memoryEntries) {
      events.push({
        id: `mem-${m.id}`,
        type: m.type === 'conversation' ? 'chat' : 'info',
        description: m.summary || m.title,
        source: m.source || 'agent',
        timestamp: m.timestamp,
        raw: JSON.stringify({ id: m.id, type: m.type, tags: m.tags, content: m.content?.slice(0, 200) }, null, 2),
        entityType: 'memory',
        entityId: m.id,
      });
    }

    for (const e of calendarEvents) {
      events.push({
        id: `cal-${e.id}`,
        type: 'info',
        description: `${e.allDay ? 'All-day' : 'Event'}: ${e.title}`,
        source: e.source || 'calendar',
        timestamp: e.startTime,
        raw: JSON.stringify({ id: e.id, start: new Date(e.startTime).toISOString(), end: new Date(e.endTime).toISOString(), location: e.location }, null, 2),
        entityType: 'calendar',
        entityId: e.id,
      });
    }

    for (const c of crmContacts) {
      if (c.interactions.length > 0) {
        const latest = [...c.interactions].sort((a, b) => b.timestamp - a.timestamp)[0];
        events.push({
          id: `crm-${c.id}-${latest.id}`,
          type: 'action',
          description: `${latest.type}: ${latest.title} (${c.name})`,
          source: 'crm',
          timestamp: latest.timestamp,
          raw: JSON.stringify({ contactId: c.id, name: c.name, stage: c.stage, interaction: latest }, null, 2),
          entityType: 'contact',
          entityId: c.id,
        });
      }
    }

    return events;
  }, [conversations, tasks, memoryEntries, calendarEvents, crmContacts]);

  const fetchGatewayEvents = useCallback(async () => {
    if (gatewayStatus !== 'connected') return;
    try {
      const result = await gateway.fetchEvents(50);
      if (Array.isArray(result) && result.length > 0) {
        const mapped: TimelineEvent[] = result.map((e: any, i: number) => ({
          id: `gw-${e.id || i}`,
          type: (e.type || 'info') as EventType,
          description: e.description || e.message || e.title || 'Gateway event',
          source: e.source || 'system',
          timestamp: e.timestamp || e.createdAt || Date.now(),
          raw: JSON.stringify(e, null, 2),
        }));
        setGatewayEvents(mapped);
      }
    } catch (e) {
      console.warn('[Timeline] Failed to fetch gateway events:', e);
    }
  }, [gateway, gatewayStatus]);

  const allEvents = useMemo(() => {
    const merged = [...localEvents, ...gatewayEvents];
    const seen = new Set<string>();
    const deduped = merged.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    let filtered = deduped;
    if (entityFilter !== 'all') {
      filtered = filtered.filter((e) => e.entityType === entityFilter);
    }
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }, [localEvents, gatewayEvents, entityFilter]);

  const sections = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {};
    for (const event of allEvents) {
      const dayKey = new Date(event.timestamp).toDateString();
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(event);
    }
    return Object.entries(groups).map(([key, data]) => ({
      title: formatDayHeader(data[0].timestamp),
      dayKey: key,
      data,
    }));
  }, [allEvents]);

  const todaySummary = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todayEvents = allEvents.filter(e => new Date(e.timestamp).toDateString() === todayStr);
    const byType: Record<string, number> = {};
    for (const e of todayEvents) {
      const key = e.entityType || 'other';
      byType[key] = (byType[key] || 0) + 1;
    }
    return { total: todayEvents.length, byType };
  }, [allEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchGatewayEvents();
    setRefreshing(false);
  }, [fetchGatewayEvents]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Timeline</Text>
      </View>

      {todaySummary.total > 0 && (
        <View style={styles.todaySummaryCard}>
          <View style={styles.todaySummaryHeader}>
            <Ionicons name="today-outline" size={16} color={C.coral} />
            <Text style={styles.todaySummaryTitle}>Today's Activity</Text>
            <View style={styles.todaySummaryCount}>
              <Text style={styles.todaySummaryCountText}>{todaySummary.total}</Text>
            </View>
          </View>
          <View style={styles.todaySummaryChips}>
            {Object.entries(todaySummary.byType).map(([type, count]) => {
              const ei = getEntityIcon(type);
              return (
                <View key={type} style={[styles.todaySummaryChip, { backgroundColor: ei.color + '15' }]}>
                  <Ionicons name={ei.icon as any} size={12} color={ei.color} />
                  <Text style={[styles.todaySummaryChipText, { color: ei.color }]}>{count}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ height: 44, flexShrink: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
          {ENTITY_FILTERS.map((item) => {
            const isActive = entityFilter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setEntityFilter(item.key);
                }}
                style={[
                  styles.filterPill,
                  isActive
                    ? { backgroundColor: item.color + '20', borderColor: item.color }
                    : { borderColor: C.border },
                ]}
              >
                <Ionicons name={item.icon as any} size={13} color={isActive ? item.color : C.textSecondary} style={{ marginRight: 4 }} />
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isActive ? item.color : C.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
            <View style={styles.sectionHeaderLine} />
            <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const connKey = item.entityType && item.entityId ? `${item.entityType}:${item.entityId}` : '';
          return (
            <TimelineItem
              item={item}
              isLast={index === section.data.length - 1}
              expanded={expandedId === item.id}
              onToggle={() => toggleExpand(item.id)}
              connCount={connKey ? (linkCounts[connKey] || 0) : 0}
            />
          );
        }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 20 },
          allEvents.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
          <EmptyState
            icon="pulse-outline"
            iconColor={C.textTertiary}
            title="No Activity Yet"
            subtitle="Your activity across all apps will appear here"
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.coral}
            colors={[C.coral]}
          />
        }
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
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
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: C.text,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterPill: {
    height: 32,
    flexDirection: 'row' as const,
    paddingHorizontal: 12,
    borderRadius: 16,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
  },
  filterPillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 8,
  },
  sectionHeaderText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.textSecondary,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  sectionHeaderCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textTertiary,
  },
  todaySummaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  todaySummaryHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 8,
  },
  todaySummaryTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  todaySummaryCount: {
    backgroundColor: C.coral + '20',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todaySummaryCountText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: C.coral,
  },
  todaySummaryChips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  todaySummaryChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  todaySummaryChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  railCol: {
    width: 28,
    alignItems: 'center',
    paddingTop: 4,
  },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  railLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  eventCard: {
    flex: 1,
    marginLeft: 4,
    marginBottom: 10,
  },
  eventCardInner: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  eventBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  connBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(91,127,255,0.12)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  connBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#5B7FFF',
  },
  eventTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  eventDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
  },
  rawBlock: {
    marginTop: 10,
    backgroundColor: C.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  rawText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: C.textSecondary,
    lineHeight: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: C.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: C.textTertiary,
  },
});
