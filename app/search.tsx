import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { getLinksFor, type EntityLink } from '@/lib/entityLinks';

const C = Colors.dark;

type SearchResultCategory = 'conversations' | 'tasks' | 'memory' | 'calendar' | 'contacts';

interface SearchResult {
  id: string;
  entityId: string;
  category: SearchResultCategory;
  title: string;
  subtitle: string;
  score: number;
  tags?: string[];
  timestamp?: number;
  onPress: () => void;
}

const CATEGORY_CONFIG: Record<SearchResultCategory, { label: string; icon: string; iconFamily: 'ion' | 'mci'; color: string }> = {
  conversations: { label: 'Conversations', icon: 'chatbubbles', iconFamily: 'ion', color: C.accent },
  tasks: { label: 'Tasks', icon: 'checkmark-circle', iconFamily: 'ion', color: C.amber },
  memory: { label: 'Memory', icon: 'brain', iconFamily: 'mci', color: C.purple },
  calendar: { label: 'Calendar', icon: 'calendar', iconFamily: 'ion', color: C.coral },
  contacts: { label: 'Contacts', icon: 'person', iconFamily: 'ion', color: C.secondary },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) {
    const h = d.getHours();
    const m = d.getMinutes();
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  if (diff < 604800000) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function scoreMatch(query: string, text: string | undefined, weight: number): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  if (lower === query) return weight * 3;
  if (lower.startsWith(query)) return weight * 2;
  if (lower.includes(query)) return weight;
  return 0;
}

function recencyBoost(timestamp: number | undefined): number {
  if (!timestamp) return 0;
  const ageHours = (Date.now() - timestamp) / 3600000;
  if (ageHours < 1) return 3;
  if (ageHours < 24) return 2;
  if (ageHours < 168) return 1;
  return 0;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { conversations, tasks, memoryEntries, calendarEvents, crmContacts } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const items: SearchResult[] = [];

    for (const c of conversations) {
      const s =
        scoreMatch(q, c.title, 10) +
        scoreMatch(q, c.lastMessage, 5) +
        recencyBoost(c.lastMessageTime);
      if (s > 0) {
        items.push({
          id: `conv-${c.id}`,
          entityId: c.id,
          category: 'conversations',
          title: c.title,
          subtitle: c.lastMessage ? c.lastMessage.slice(0, 80) : `${c.messageCount} messages`,
          score: s,
          timestamp: c.lastMessageTime,
          onPress: () => router.push(`/chat/${c.id}`),
        });
      }
    }

    for (const t of tasks) {
      const s =
        scoreMatch(q, t.title, 10) +
        scoreMatch(q, t.description, 5) +
        (t.tags?.some(tag => tag.toLowerCase().includes(q)) ? 8 : 0) +
        (t.source?.toLowerCase().includes(q) ? 3 : 0) +
        recencyBoost(t.updatedAt) +
        (t.status === 'in_progress' ? 2 : 0) +
        (t.priority === 'urgent' ? 2 : t.priority === 'high' ? 1 : 0);
      if (s > 0) {
        items.push({
          id: `task-${t.id}`,
          entityId: t.id,
          category: 'tasks',
          title: t.title,
          subtitle: t.description ? t.description.slice(0, 80) : `${t.status} · ${t.priority}`,
          score: s,
          tags: t.tags,
          timestamp: t.updatedAt,
          onPress: () => router.push('/(tabs)/vault'),
        });
      }
    }

    for (const m of memoryEntries) {
      const s =
        scoreMatch(q, m.title, 10) +
        scoreMatch(q, m.content, 4) +
        (m.tags?.some(tag => tag.toLowerCase().includes(q)) ? 8 : 0) +
        (m.source?.toLowerCase().includes(q) ? 3 : 0) +
        recencyBoost(m.timestamp) +
        (m.pinned ? 3 : 0) +
        (typeof m.relevance === 'number' ? m.relevance * 5 : 0);
      if (s > 0) {
        items.push({
          id: `mem-${m.id}`,
          entityId: m.id,
          category: 'memory',
          title: m.title,
          subtitle: m.summary || m.content.slice(0, 80),
          score: s,
          tags: m.tags,
          timestamp: m.timestamp,
          onPress: () => router.push('/(tabs)/vault'),
        });
      }
    }

    for (const e of calendarEvents) {
      const s =
        scoreMatch(q, e.title, 10) +
        scoreMatch(q, e.description, 5) +
        scoreMatch(q, e.location, 6) +
        (e.tags?.some(tag => tag.toLowerCase().includes(q)) ? 8 : 0) +
        (e.attendees?.some(a => a.toLowerCase().includes(q)) ? 7 : 0) +
        recencyBoost(e.startTime);
      if (s > 0) {
        items.push({
          id: `cal-${e.id}`,
          entityId: e.id,
          category: 'calendar',
          title: e.title,
          subtitle: e.description ? e.description.slice(0, 60) : formatTime(e.startTime),
          score: s,
          tags: e.tags,
          timestamp: e.startTime,
          onPress: () => router.push('/(tabs)/calendar'),
        });
      }
    }

    for (const c of crmContacts) {
      const s =
        scoreMatch(q, c.name, 10) +
        scoreMatch(q, c.email, 6) +
        scoreMatch(q, c.company, 8) +
        scoreMatch(q, c.notes, 3) +
        scoreMatch(q, c.role, 5) +
        (c.tags?.some(tag => tag.toLowerCase().includes(q)) ? 8 : 0) +
        recencyBoost(c.lastInteraction);
      if (s > 0) {
        items.push({
          id: `crm-${c.id}`,
          entityId: c.id,
          category: 'contacts',
          title: c.name,
          subtitle: [c.company, c.role, c.email].filter(Boolean).join(' · ').slice(0, 80) || c.stage,
          score: s,
          tags: c.tags,
          timestamp: c.lastInteraction,
          onPress: () => router.push('/crm' as any),
        });
      }
    }

    items.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    return items;
  }, [query, conversations, tasks, memoryEntries, calendarEvents, crmContacts]);

  const grouped = useMemo(() => {
    const sections: { category: SearchResultCategory; data: SearchResult[] }[] = [];
    const order: SearchResultCategory[] = ['conversations', 'tasks', 'memory', 'calendar', 'contacts'];
    for (const cat of order) {
      const items = results.filter(r => r.category === cat);
      if (items.length > 0) sections.push({ category: cat, data: items });
    }
    return sections;
  }, [results]);

  const flatData = useMemo(() => {
    const list: (SearchResult | { type: 'header'; category: SearchResultCategory; count: number })[] = [];
    for (const section of grouped) {
      list.push({ type: 'header', category: section.category, count: section.data.length });
      list.push(...section.data);
    }
    return list;
  }, [grouped]);

  const renderItem = ({ item }: { item: typeof flatData[number] }) => {
    if ('type' in item && item.type === 'header') {
      const config = CATEGORY_CONFIG[item.category];
      return (
        <View style={styles.sectionHeader}>
          {config.iconFamily === 'mci' ? (
            <MaterialCommunityIcons name={config.icon as any} size={16} color={config.color} />
          ) : (
            <Ionicons name={config.icon as any} size={16} color={config.color} />
          )}
          <Text style={[styles.sectionTitle, { color: config.color }]}>{config.label}</Text>
          <Text style={styles.sectionCount}>{item.count}</Text>
        </View>
      );
    }

    const result = item as SearchResult;
    const config = CATEGORY_CONFIG[result.category];
    const hasTags = result.tags && result.tags.length > 0;
    const visibleTags = result.tags?.filter(t => !t.startsWith('from:')).slice(0, 3);

    return (
      <Pressable
        style={({ pressed }) => [styles.resultItem, pressed && { opacity: 0.7, backgroundColor: C.cardElevated }]}
        onPress={() => {
          result.onPress();
        }}
      >
        <View style={[styles.resultIcon, { backgroundColor: config.color + '18' }]}>
          {config.iconFamily === 'mci' ? (
            <MaterialCommunityIcons name={config.icon as any} size={18} color={config.color} />
          ) : (
            <Ionicons name={config.icon as any} size={18} color={config.color} />
          )}
        </View>
        <View style={styles.resultContent}>
          <Text style={styles.resultTitle} numberOfLines={1}>{result.title}</Text>
          <Text style={styles.resultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
          {visibleTags && visibleTags.length > 0 && (
            <View style={styles.tagRow}>
              {visibleTags.map((tag, i) => (
                <View key={i} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {result.timestamp && (
          <Text style={styles.resultTime}>{formatTime(result.timestamp)}</Text>
        )}
      </Pressable>
    );
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const totalCount = results.length;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={C.textTertiary} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search everything..."
            placeholderTextColor={C.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={C.primary}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={C.textTertiary} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      {query.trim().length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search" size={48} color={C.textTertiary} />
          <Text style={styles.emptyTitle}>Search ClawBase</Text>
          <Text style={styles.emptySubtitle}>Find conversations, tasks, memories, events, and contacts</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color={C.textTertiary} />
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptySubtitle}>Try a different search term</Text>
        </View>
      ) : (
        <>
          <View style={styles.resultsSummary}>
            <Text style={styles.resultsSummaryText}>{totalCount} result{totalCount !== 1 ? 's' : ''}</Text>
          </View>
          <FlatList
            data={flatData}
            renderItem={renderItem}
            keyExtractor={(item, index) => ('type' in item ? `header-${item.category}` : (item as SearchResult).id)}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        </>
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: C.text,
    height: 44,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: C.primary,
  },
  resultsSummary: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  resultsSummaryText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: C.textTertiary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  sectionCount: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: C.textTertiary,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultContent: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: C.text,
  },
  resultSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: C.textSecondary,
  },
  resultTime: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: C.textTertiary,
    marginLeft: 4,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  tagChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: C.textTertiary,
  },
  listContent: {
    paddingBottom: 40,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: C.text,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
