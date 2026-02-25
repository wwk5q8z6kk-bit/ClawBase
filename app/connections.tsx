import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { getAllLinks, type EntityLink, type EntityType } from '@/lib/entityLinks';

const C = Colors.dark;

type FilterType = 'all' | EntityType;

const ENTITY_CONFIG: Record<EntityType, { icon: string; color: string; label: string }> = {
  conversation: { icon: 'chatbubbles', color: '#5B7FFF', label: 'Conversations' },
  task: { icon: 'checkmark-circle', color: '#FFB020', label: 'Tasks' },
  memory: { icon: 'book', color: '#8B7FFF', label: 'Memory' },
  calendar: { icon: 'calendar', color: '#FF7B5C', label: 'Calendar' },
  contact: { icon: 'person', color: '#9CA3AF', label: 'Contacts' },
};

const RELATION_LABELS: Record<string, string> = {
  created_from: 'Created from',
  mentions: 'Mentions',
  related_to: 'Related to',
  spawned_by: 'Spawned by',
};

export default function ConnectionsScreen() {
  const insets = useSafeAreaInsets();
  const { tasks, memoryEntries, calendarEvents, crmContacts, conversations } = useApp();
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');

  useFocusEffect(
    useCallback(() => {
      getAllLinks().then(setLinks).catch(() => {});
    }, [])
  );

  const resolveEntityName = (type: EntityType, id: string): string => {
    if (type === 'task') return tasks.find(t => t.id === id)?.title || 'Unknown Task';
    if (type === 'memory') return memoryEntries.find(m => m.id === id)?.title || 'Unknown Memory';
    if (type === 'contact') return crmContacts.find(c => c.id === id)?.name || 'Unknown Contact';
    if (type === 'calendar') return calendarEvents.find(e => e.id === id)?.title || 'Unknown Event';
    if (type === 'conversation') return conversations.find(c => c.id === id)?.title || 'Unknown Chat';
    return id.slice(0, 8);
  };

  const navigateToEntity = (type: EntityType, id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'conversation') router.push(`/chat/${id}`);
    else if (type === 'task' || type === 'memory') router.push('/(tabs)/vault');
    else if (type === 'calendar') router.push('/(tabs)/calendar');
    else if (type === 'contact') router.push('/crm' as any);
  };

  const filteredLinks = useMemo(() => {
    if (filter === 'all') return links;
    return links.filter(l => l.sourceType === filter || l.targetType === filter);
  }, [links, filter]);

  const stats = useMemo(() => {
    const entitySets: Record<string, Set<string>> = {};
    for (const link of links) {
      if (!entitySets[link.sourceType]) entitySets[link.sourceType] = new Set();
      if (!entitySets[link.targetType]) entitySets[link.targetType] = new Set();
      entitySets[link.sourceType].add(link.sourceId);
      entitySets[link.targetType].add(link.targetId);
    }
    const typeCounts: Record<string, number> = {};
    for (const [type, set] of Object.entries(entitySets)) {
      typeCounts[type] = set.size;
    }
    return typeCounts;
  }, [links]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const renderLink = ({ item }: { item: EntityLink }) => {
    const sourceConfig = ENTITY_CONFIG[item.sourceType];
    const targetConfig = ENTITY_CONFIG[item.targetType];
    const sourceName = resolveEntityName(item.sourceType, item.sourceId);
    const targetName = resolveEntityName(item.targetType, item.targetId);
    const relation = RELATION_LABELS[item.relation] || item.relation;

    return (
      <View style={s.linkCard}>
        <Pressable
          style={({ pressed }) => [s.entityRow, pressed && { opacity: 0.7 }]}
          onPress={() => navigateToEntity(item.sourceType, item.sourceId)}
        >
          <View style={[s.entityIcon, { backgroundColor: sourceConfig.color + '18' }]}>
            <Ionicons name={sourceConfig.icon as any} size={14} color={sourceConfig.color} />
          </View>
          <Text style={[s.entityName, { color: sourceConfig.color }]} numberOfLines={1}>{sourceName}</Text>
        </Pressable>

        <View style={s.relationRow}>
          <View style={s.relationLine} />
          <Text style={s.relationLabel}>{relation}</Text>
          <Ionicons name="arrow-forward" size={12} color={C.textTertiary} />
          <View style={s.relationLine} />
        </View>

        <Pressable
          style={({ pressed }) => [s.entityRow, pressed && { opacity: 0.7 }]}
          onPress={() => navigateToEntity(item.targetType, item.targetId)}
        >
          <View style={[s.entityIcon, { backgroundColor: targetConfig.color + '18' }]}>
            <Ionicons name={targetConfig.icon as any} size={14} color={targetConfig.color} />
          </View>
          <Text style={[s.entityName, { color: targetConfig.color }]} numberOfLines={1}>{targetName}</Text>
        </Pressable>
      </View>
    );
  };

  const filterOptions: { key: FilterType; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: C.primary },
    ...Object.entries(ENTITY_CONFIG)
      .filter(([key]) => (stats[key] || 0) > 0)
      .map(([key, cfg]) => ({ key: key as FilterType, label: cfg.label, color: cfg.color })),
  ];

  return (
    <View style={[s.container, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={C.textSecondary} />
        </Pressable>
        <View style={s.headerCenter}>
          <MaterialCommunityIcons name="graph-outline" size={18} color={C.accent} />
          <Text style={s.headerTitle}>Knowledge Graph</Text>
        </View>
        <Text style={s.headerCount}>{links.length}</Text>
      </View>

      <View style={s.statsBar}>
        {Object.entries(ENTITY_CONFIG)
          .filter(([key]) => (stats[key] || 0) > 0)
          .map(([key, cfg]) => (
            <View key={key} style={s.statChip}>
              <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
              <Text style={[s.statChipText, { color: cfg.color }]}>{stats[key]}</Text>
            </View>
          ))}
      </View>

      <View style={s.filterRow}>
        {filterOptions.map(opt => (
          <Pressable
            key={opt.key}
            style={[s.filterChip, filter === opt.key && { backgroundColor: opt.color + '20', borderColor: opt.color }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilter(opt.key);
            }}
          >
            <Text style={[s.filterChipText, filter === opt.key && { color: opt.color }]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      {filteredLinks.length === 0 ? (
        <View style={[s.empty, Platform.OS === 'web' && { paddingBottom: 34 }]}>
          <MaterialCommunityIcons name="graph-outline" size={48} color={C.textTertiary} />
          <Text style={s.emptyTitle}>No connections yet</Text>
          <Text style={s.emptySubtitle}>Entity links will appear here as you use ClawBase</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLinks}
          renderItem={renderLink}
          keyExtractor={item => item.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, gap: 12,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: C.text },
  headerCount: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.textTertiary },
  statsBar: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 8,
  },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  statChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  filterChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary },
  list: { paddingHorizontal: 16, gap: 8 },
  linkCard: {
    backgroundColor: C.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.borderLight,
  },
  entityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  entityIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  entityName: {
    fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1,
  },
  relationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingLeft: 14,
  },
  relationLine: { flex: 1, height: 1, backgroundColor: C.border },
  relationLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: C.text },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textSecondary,
    textAlign: 'center', lineHeight: 20,
  },
});
