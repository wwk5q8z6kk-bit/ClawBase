import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { MemoryEntry } from '@/lib/types';

const C = Colors.dark;

const TYPE_CONFIG: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  conversation: { icon: 'chatbubble-outline', color: C.coral, label: 'Chat' },
  note: { icon: 'document-text-outline', color: C.secondary, label: 'Note' },
  task: { icon: 'checkbox-outline', color: C.amber, label: 'Task' },
  event: { icon: 'calendar-outline', color: C.accent, label: 'Event' },
};

const SOURCE_CONFIG: Record<string, { icon: string; color: string }> = {
  chat: { icon: 'chatbubble', color: C.coral },
  github: { icon: 'logo-github', color: '#fff' },
  email: { icon: 'mail', color: C.amber },
  calendar: { icon: 'calendar', color: C.accent },
  system: { icon: 'settings', color: C.textSecondary },
};

function getDateLabel(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateStart.getTime() === today.getTime()) return 'Today';
  if (dateStart.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function DateHeader({ label }: { label: string }) {
  return (
    <View style={styles.dateHeader}>
      <View style={styles.dateLine} />
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.dateLine} />
    </View>
  );
}

function MemoryItem({ item }: { item: MemoryEntry }) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.note;
  const source = item.source ? SOURCE_CONFIG[item.source] : null;
  const timeStr = new Date(item.timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.memoryItem}>
      <View style={styles.timelineCol}>
        <View style={[styles.timelineDot, { backgroundColor: config.color }]} />
        <View style={styles.timelineLine} />
      </View>
      <View style={styles.memoryCard}>
        <View style={styles.memoryHeader}>
          <View style={[styles.typeIcon, { backgroundColor: config.color + '15' }]}>
            <Ionicons name={config.icon as any} size={16} color={config.color} />
          </View>
          <Text style={styles.memoryTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={styles.memoryText} numberOfLines={3}>{item.content}</Text>
        <View style={styles.memoryFooter}>
          <View style={[styles.typeBadge, { backgroundColor: config.color + '18' }]}>
            <Text style={[styles.typeBadgeText, { color: config.color }]}>{config.label}</Text>
          </View>
          {source && (
            <View style={styles.sourceBadge}>
              <Ionicons name={source.icon as any} size={10} color={source.color} />
              <Text style={styles.sourceText}>{item.source}</Text>
            </View>
          )}
          {item.tags && item.tags.length > 0 && (
            <View style={styles.tagBadge}>
              <Ionicons name="pricetag-outline" size={10} color={C.textTertiary} />
              <Text style={styles.tagText}>{item.tags[0]}</Text>
            </View>
          )}
          <Text style={styles.memoryTime}>{timeStr}</Text>
        </View>
      </View>
    </View>
  );
}

type FilterType = 'all' | 'conversation' | 'note' | 'task' | 'event';

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { memoryEntries } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredEntries = useMemo(() => {
    let entries = [...memoryEntries];
    if (filter !== 'all') {
      entries = entries.filter((e) => e.type === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q),
      );
    }
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries;
  }, [memoryEntries, filter, search]);

  const groupedEntries = useMemo(() => {
    const groups: { label: string; data: MemoryEntry[] }[] = [];
    let currentLabel = '';
    for (const entry of filteredEntries) {
      const label = getDateLabel(entry.timestamp);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, data: [entry] });
      } else {
        groups[groups.length - 1].data.push(entry);
      }
    }
    return groups;
  }, [filteredEntries]);

  const flatData = useMemo(() => {
    const items: ({ type: 'header'; label: string } | { type: 'item'; entry: MemoryEntry })[] = [];
    for (const group of groupedEntries) {
      items.push({ type: 'header', label: group.label });
      for (const entry of group.data) {
        items.push({ type: 'item', entry });
      }
    }
    return items;
  }, [groupedEntries]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memory</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{memoryEntries.length}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search memories..."
          placeholderTextColor={C.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={C.textTertiary} />
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'conversation', label: 'Chats' },
            { key: 'note', label: 'Notes' },
            { key: 'task', label: 'Tasks' },
            { key: 'event', label: 'Events' },
          ] as const
        ).map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.filterChip,
              filter === f.key && styles.filterChipActive,
            ]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f.key && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={flatData}
        keyExtractor={(item, i) => item.type === 'header' ? `header-${item.label}` : `item-${item.entry.id}`}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <DateHeader label={item.label} />;
          }
          return <MemoryItem item={item.entry} />;
        }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
          flatData.length === 0 && styles.emptyContainer,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="file-tray-outline" size={44} color={C.textTertiary} />
            <Text style={styles.emptyTitle}>
              {search ? 'No results found' : 'No memories yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search
                ? 'Try a different search term'
                : 'Your conversations and tasks will appear here'}
            </Text>
          </View>
        }
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: C.text,
  },
  countBadge: {
    backgroundColor: C.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: C.primary,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: C.borderLight,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: C.text,
    height: 44,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  filterChipActive: {
    backgroundColor: C.primaryMuted,
    borderColor: C.primary,
  },
  filterChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.textSecondary,
  },
  filterChipTextActive: {
    color: C.primary,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.borderLight,
  },
  dateLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memoryItem: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 2,
  },
  timelineCol: {
    alignItems: 'center',
    width: 20,
    paddingTop: 6,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: C.borderLight,
    marginTop: 4,
  },
  memoryCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 6,
    marginBottom: 6,
  },
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  memoryText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
  },
  memoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sourceText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: C.textTertiary,
    textTransform: 'capitalize',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tagText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: C.textTertiary,
  },
  memoryTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: C.textTertiary,
    marginLeft: 'auto',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
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
