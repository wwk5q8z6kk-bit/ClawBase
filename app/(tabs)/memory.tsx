import React, { useState, useCallback, useMemo } from 'react';
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
  conversation: { icon: 'chatbubble-outline', color: C.accent, label: 'Chat' },
  note: { icon: 'document-text-outline', color: C.secondary, label: 'Note' },
  task: { icon: 'checkbox-outline', color: C.warning, label: 'Task' },
  event: { icon: 'calendar-outline', color: C.primary, label: 'Event' },
};

function MemoryItem({ item }: { item: MemoryEntry }) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.note;
  const date = new Date(item.timestamp);
  const timeStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.memoryItem}>
      <View style={[styles.typeIcon, { backgroundColor: config.color + '15' }]}>
        <Ionicons name={config.icon as any} size={18} color={config.color} />
      </View>
      <View style={styles.memoryContent}>
        <View style={styles.memoryHeader}>
          <Text style={styles.memoryTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: config.color + '20' }]}>
            <Text style={[styles.typeBadgeText, { color: config.color }]}>
              {config.label}
            </Text>
          </View>
        </View>
        <Text style={styles.memoryText} numberOfLines={2}>
          {item.content}
        </Text>
        <Text style={styles.memoryTime}>{timeStr}</Text>
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
    let entries = memoryEntries;
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
    return entries;
  }, [memoryEntries, filter, search]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memory</Text>
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
        data={filteredEntries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MemoryItem item={item} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
          filteredEntries.length === 0 && styles.emptyContainer,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="file-tray-outline" size={48} color={C.textTertiary} />
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: C.text,
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
  memoryItem: {
    flexDirection: 'row',
    paddingVertical: 14,
    gap: 12,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryContent: {
    flex: 1,
    gap: 4,
  },
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memoryTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
    flex: 1,
    marginRight: 8,
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
  memoryText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
  },
  memoryTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: C.borderLight,
    marginLeft: 52,
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
