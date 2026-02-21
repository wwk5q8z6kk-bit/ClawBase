import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import { Card } from '@/components/GlassCard';
import type { MemoryEntry } from '@/lib/types';

const C = Colors.dark;

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  conversation: { icon: 'chatbubble-outline', color: C.coral, label: 'Chat' },
  note: { icon: 'document-text-outline', color: C.secondary, label: 'Note' },
  task: { icon: 'checkbox-outline', color: C.amber, label: 'Task' },
  event: { icon: 'calendar-outline', color: C.accent, label: 'Event' },
  summary: { icon: 'sparkles-outline', color: '#FF9F5A', label: 'Summary' },
  document: { icon: 'folder-open-outline', color: '#8B7FFF', label: 'Document' },
};

const SOURCE_CONFIG: Record<string, { icon: string; color: string }> = {
  chat: { icon: 'chatbubble', color: C.coral },
  github: { icon: 'logo-github', color: '#fff' },
  email: { icon: 'mail', color: C.amber },
  calendar: { icon: 'calendar', color: C.accent },
  system: { icon: 'settings', color: C.textSecondary },
  notion: { icon: 'document', color: '#8B7FFF' },
  agent: { icon: 'flash', color: C.coral },
};

const REVIEW_FILTERS = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'unread', label: 'Unread', icon: 'eye-off-outline' },
  { key: 'pinned', label: 'Pinned', icon: 'pin-outline' },
  { key: 'deferred', label: 'Deferred', icon: 'time-outline' },
  { key: 'reviewed', label: 'Reviewed', icon: 'checkmark-outline' },
] as const;

type SortOption = 'newest' | 'oldest' | 'relevance' | 'alphabetical';

const SORT_OPTIONS: { key: SortOption; label: string; icon: string }[] = [
  { key: 'newest', label: 'Newest First', icon: 'arrow-down-outline' },
  { key: 'oldest', label: 'Oldest First', icon: 'arrow-up-outline' },
  { key: 'relevance', label: 'By Relevance', icon: 'trending-up-outline' },
  { key: 'alphabetical', label: 'Alphabetical', icon: 'text-outline' },
];

function getDateLabel(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateStart.getTime() === today.getTime()) return 'Today';
  if (dateStart.getTime() === yesterday.getTime()) return 'Yesterday';
  const daysAgo = Math.floor((today.getTime() - dateStart.getTime()) / 86400000);
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function formatFullTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function MemoryItem({
  item,
  onPin,
  onReview,
  onDefer,
  onPress,
}: {
  item: MemoryEntry;
  onPin: () => void;
  onReview: () => void;
  onDefer: () => void;
  onPress: () => void;
}) {
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
      <Pressable
        style={[
          styles.memoryCard,
          item.pinned && styles.memoryCardPinned,
          C.shadow.card as any,
          { borderLeftWidth: 3, borderLeftColor: config.color + '60' },
        ]}
        onPress={onPress}
      >
        <View style={styles.memoryHeader}>
          <View style={[styles.typeIcon, { backgroundColor: config.color + '15' }]}>
            <Ionicons name={config.icon as any} size={16} color={config.color} />
          </View>
          <Text style={styles.memoryTitle} numberOfLines={1}>{item.title}</Text>
          {item.pinned && <Ionicons name="pin" size={12} color={C.coral} />}
          {item.reviewStatus === 'deferred' && <Ionicons name="time" size={12} color="#8B7FFF" />}
        </View>
        {item.summary && (
          <Text style={styles.memorySummary} numberOfLines={1}>{item.summary}</Text>
        )}
        <Text style={styles.memoryText} numberOfLines={3}>{item.content}</Text>
        {typeof item.relevance === 'number' && (
          <View style={styles.relevanceRow}>
            <Text style={styles.relevanceLabel}>Relevance</Text>
            <View style={styles.relevanceBarBg}>
              <View style={[styles.relevanceBarFill, { width: `${Math.round(item.relevance * 100)}%` }]} />
            </View>
            <Text style={styles.relevanceValue}>{Math.round(item.relevance * 100)}%</Text>
          </View>
        )}

        {item.tags && item.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.tags.map((tag, i) => (
              <View key={i} style={styles.tagChip}>
                <Ionicons name="pricetag-outline" size={9} color={C.accent} />
                <Text style={styles.tagChipText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.memoryFooter}>
          <View style={[styles.typeBadge, { backgroundColor: config.color + '18' }]}>
            <Text style={[styles.typeBadgeText, { color: config.color }]}>{config.label}</Text>
          </View>
          {source && (
            <View style={styles.sourceBadge}>
              <Ionicons name={source.icon as any} size={10} color={source.color} />
              <Text style={styles.sourceTextBadge}>{item.source}</Text>
            </View>
          )}
          {item.reviewStatus && (
            <View style={[
              styles.reviewBadge,
              item.reviewStatus === 'unread' && { backgroundColor: C.coral + '15' },
              item.reviewStatus === 'deferred' && { backgroundColor: '#8B7FFF15' },
              item.reviewStatus === 'reviewed' && { backgroundColor: C.success + '15' },
            ]}>
              <Text style={[
                styles.reviewBadgeText,
                item.reviewStatus === 'unread' && { color: C.coral },
                item.reviewStatus === 'deferred' && { color: '#8B7FFF' },
                item.reviewStatus === 'reviewed' && { color: C.success },
              ]}>{item.reviewStatus}</Text>
            </View>
          )}
          <Text style={styles.memoryTime}>{timeStr}</Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); onPin(); }}>
            <Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={14} color={item.pinned ? C.coral : C.textTertiary} />
            <Text style={[styles.actionBtnLabel, item.pinned && { color: C.coral }]}>Pin</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); onReview(); }}>
            <Ionicons name={item.reviewStatus === 'reviewed' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={14} color={item.reviewStatus === 'reviewed' ? C.success : C.textTertiary} />
            <Text style={[styles.actionBtnLabel, item.reviewStatus === 'reviewed' && { color: C.success }]}>Review</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); onDefer(); }}>
            <Ionicons name="time-outline" size={14} color={item.reviewStatus === 'deferred' ? '#8B7FFF' : C.textTertiary} />
            <Text style={[styles.actionBtnLabel, item.reviewStatus === 'deferred' && { color: '#8B7FFF' }]}>Defer</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

function MemoryDetailModal({
  item,
  visible,
  onClose,
  onPin,
  onReview,
  onDefer,
  onDelete,
}: {
  item: MemoryEntry | null;
  visible: boolean;
  onClose: () => void;
  onPin: () => void;
  onReview: () => void;
  onDefer: () => void;
  onDelete: () => void;
}) {
  if (!item) return null;
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.note;
  const source = item.source ? SOURCE_CONFIG[item.source] : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.handle} />

          <ScrollView style={modalStyles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={modalStyles.title}>{item.title}</Text>

            <View style={modalStyles.badgeRow}>
              <View style={[modalStyles.typeBadge, { backgroundColor: config.color + '20' }]}>
                <Ionicons name={config.icon as any} size={14} color={config.color} />
                <Text style={[modalStyles.typeBadgeText, { color: config.color }]}>{config.label}</Text>
              </View>

              {source && (
                <View style={modalStyles.sourceBadge}>
                  <Ionicons name={source.icon as any} size={12} color={source.color} />
                  <Text style={modalStyles.sourceText}>{item.source}</Text>
                </View>
              )}

              {item.reviewStatus && (
                <View style={[
                  modalStyles.reviewBadge,
                  item.reviewStatus === 'unread' && { backgroundColor: C.coral + '18' },
                  item.reviewStatus === 'deferred' && { backgroundColor: '#8B7FFF18' },
                  item.reviewStatus === 'reviewed' && { backgroundColor: C.success + '18' },
                ]}>
                  <Ionicons
                    name={
                      item.reviewStatus === 'reviewed' ? 'checkmark-circle' :
                        item.reviewStatus === 'deferred' ? 'time' : 'eye-off'
                    }
                    size={12}
                    color={
                      item.reviewStatus === 'reviewed' ? C.success :
                        item.reviewStatus === 'deferred' ? '#8B7FFF' : C.coral
                    }
                  />
                  <Text style={[
                    modalStyles.reviewText,
                    item.reviewStatus === 'unread' && { color: C.coral },
                    item.reviewStatus === 'deferred' && { color: '#8B7FFF' },
                    item.reviewStatus === 'reviewed' && { color: C.success },
                  ]}>{item.reviewStatus}</Text>
                </View>
              )}

              {item.pinned && (
                <View style={[modalStyles.typeBadge, { backgroundColor: C.coral + '18' }]}>
                  <Ionicons name="pin" size={12} color={C.coral} />
                  <Text style={[modalStyles.typeBadgeText, { color: C.coral }]}>Pinned</Text>
                </View>
              )}
            </View>

            <View style={modalStyles.section}>
              <Text style={modalStyles.sectionLabel}>Content</Text>
              <Text style={modalStyles.contentText}>{item.content}</Text>
            </View>

            {item.summary && (
              <View style={modalStyles.summaryBox}>
                <Ionicons name="sparkles" size={14} color={C.accent} />
                <Text style={modalStyles.summaryText}>{item.summary}</Text>
              </View>
            )}

            {typeof item.relevance === 'number' && (
              <View style={modalStyles.section}>
                <Text style={modalStyles.sectionLabel}>Relevance</Text>
                <View style={modalStyles.relevanceRow}>
                  <View style={modalStyles.relevanceBarBg}>
                    <LinearGradient
                      colors={[C.secondary, C.accent]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[modalStyles.relevanceBarFill, { width: `${Math.round(item.relevance * 100)}%` }]}
                    />
                  </View>
                  <Text style={modalStyles.relevanceValue}>{Math.round(item.relevance * 100)}%</Text>
                </View>
              </View>
            )}

            {item.tags && item.tags.length > 0 && (
              <View style={modalStyles.section}>
                <Text style={modalStyles.sectionLabel}>Tags</Text>
                <View style={modalStyles.tagsWrap}>
                  {item.tags.map((tag, i) => (
                    <View key={i} style={modalStyles.tagChip}>
                      <Ionicons name="pricetag-outline" size={11} color={C.accent} />
                      <Text style={modalStyles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {item.linkedIds && item.linkedIds.length > 0 && (
              <View style={modalStyles.section}>
                <Text style={modalStyles.sectionLabel}>Linked Items</Text>
                {item.linkedIds.map((lid, i) => (
                  <View key={i} style={modalStyles.linkedItem}>
                    <Ionicons name="link-outline" size={12} color={C.textTertiary} />
                    <Text style={modalStyles.linkedText}>{lid}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={modalStyles.section}>
              <Text style={modalStyles.sectionLabel}>Timestamp</Text>
              <Text style={modalStyles.timestampText}>{formatFullTimestamp(item.timestamp)}</Text>
            </View>

            <Pressable
              style={modalStyles.deleteBtn}
              onPress={() => { Haptics.selectionAsync(); onDelete(); }}
            >
              <Ionicons name="trash-outline" size={16} color={C.error} />
              <Text style={modalStyles.deleteBtnText}>Delete Entry</Text>
            </Pressable>

            <View style={{ height: 80 }} />
          </ScrollView>

          <View style={modalStyles.actionBar}>
            <Pressable
              style={[modalStyles.actionBtn, item.pinned && { backgroundColor: C.coral + '20' }]}
              onPress={() => { Haptics.selectionAsync(); onPin(); }}
            >
              <Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={18} color={item.pinned ? C.coral : C.textSecondary} />
              <Text style={[modalStyles.actionLabel, item.pinned && { color: C.coral }]}>{item.pinned ? 'Unpin' : 'Pin'}</Text>
            </Pressable>
            <Pressable
              style={[modalStyles.actionBtn, item.reviewStatus === 'reviewed' && { backgroundColor: C.success + '20' }]}
              onPress={() => { Haptics.selectionAsync(); onReview(); }}
            >
              <Ionicons name={item.reviewStatus === 'reviewed' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={item.reviewStatus === 'reviewed' ? C.success : C.textSecondary} />
              <Text style={[modalStyles.actionLabel, item.reviewStatus === 'reviewed' && { color: C.success }]}>Reviewed</Text>
            </Pressable>
            <Pressable
              style={[modalStyles.actionBtn, item.reviewStatus === 'deferred' && { backgroundColor: '#8B7FFF20' }]}
              onPress={() => { Haptics.selectionAsync(); onDefer(); }}
            >
              <Ionicons name="time-outline" size={18} color={item.reviewStatus === 'deferred' ? '#8B7FFF' : C.textSecondary} />
              <Text style={[modalStyles.actionLabel, item.reviewStatus === 'deferred' && { color: '#8B7FFF' }]}>Defer</Text>
            </Pressable>
            <Pressable
              style={modalStyles.actionBtn}
              onPress={() => { Haptics.selectionAsync(); onClose(); }}
            >
              <Ionicons name="close-outline" size={18} color={C.textSecondary} />
              <Text style={modalStyles.actionLabel}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type FilterType = 'all' | 'conversation' | 'note' | 'task' | 'event' | 'summary' | 'document';
type ReviewFilter = typeof REVIEW_FILTERS[number]['key'];

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { memoryEntries, updateMemoryEntry, createMemoryEntry, deleteMemoryEntry, gatewayStatus, gatewayMemoryFiles, fetchGatewayMemory } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [showTagBrowser, setShowTagBrowser] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [showSortModal, setShowSortModal] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<MemoryEntry | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newType, setNewType] = useState<MemoryEntry['type']>('note');

  const [syncingMemory, setSyncingMemory] = useState(false);

  const handleSyncMemory = useCallback(async () => {
    setSyncingMemory(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await fetchGatewayMemory();
    } catch { }
    setSyncingMemory(false);
  }, [fetchGatewayMemory]);

  const TAG_CLOUD_COLORS = [C.coral, C.accent, C.secondary, C.amber, C.purple, C.primary, C.success];

  const tagFrequencies = useMemo(() => {
    const freq: Record<string, number> = {};
    memoryEntries.forEach((e) => e.tags?.forEach((t) => { freq[t] = (freq[t] || 0) + 1; }));
    return freq;
  }, [memoryEntries]);

  const allTags = useMemo(() => {
    return Object.keys(tagFrequencies).sort((a, b) => tagFrequencies[b] - tagFrequencies[a]);
  }, [tagFrequencies]);

  const maxTagFreq = useMemo(() => Math.max(1, ...Object.values(tagFrequencies)), [tagFrequencies]);

  const digestStats = useMemo(() => {
    const total = memoryEntries.length;
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = memoryEntries.filter((e) => e.timestamp >= weekAgo).length;
    const sourceCounts: Record<string, number> = {};
    memoryEntries.forEach((e) => { if (e.source) sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1; });
    const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const topTag = allTags[0] || 'N/A';
    return { total, thisWeek, topSource, topTag };
  }, [memoryEntries, allTags]);

  const deferredCount = useMemo(
    () => memoryEntries.filter((e) => e.reviewStatus === 'deferred').length,
    [memoryEntries],
  );

  const filteredEntries = useMemo(() => {
    let entries = [...memoryEntries];
    if (filter !== 'all') {
      entries = entries.filter((e) => e.type === filter);
    }
    if (reviewFilter === 'unread') {
      entries = entries.filter((e) => !e.reviewStatus || e.reviewStatus === 'unread');
    } else if (reviewFilter === 'pinned') {
      entries = entries.filter((e) => e.pinned);
    } else if (reviewFilter === 'deferred') {
      entries = entries.filter((e) => e.reviewStatus === 'deferred');
    } else if (reviewFilter === 'reviewed') {
      entries = entries.filter((e) => e.reviewStatus === 'reviewed');
    }
    if (selectedTag) {
      entries = entries.filter((e) => e.tags?.includes(selectedTag));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    entries.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      switch (sortOption) {
        case 'oldest':
          return a.timestamp - b.timestamp;
        case 'relevance':
          return (b.relevance ?? 0) - (a.relevance ?? 0);
        case 'alphabetical':
          return a.title.localeCompare(b.title);
        case 'newest':
        default:
          return b.timestamp - a.timestamp;
      }
    });
    return entries;
  }, [memoryEntries, filter, reviewFilter, selectedTag, search, sortOption]);

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

  const handlePin = useCallback((id: string, currentPinned?: boolean) => {
    updateMemoryEntry(id, { pinned: !currentPinned });
  }, [updateMemoryEntry]);

  const handleReview = useCallback((id: string) => {
    updateMemoryEntry(id, { reviewStatus: 'reviewed' });
  }, [updateMemoryEntry]);

  const handleDefer = useCallback((id: string, currentStatus?: string) => {
    updateMemoryEntry(id, { reviewStatus: currentStatus === 'deferred' ? 'unread' : 'deferred' });
  }, [updateMemoryEntry]);

  const openDetail = useCallback((entry: MemoryEntry) => {
    setSelectedMemory(entry);
    setShowDetailModal(true);
    Haptics.selectionAsync();
  }, []);

  const currentSelectedMemory = useMemo(() => {
    if (!selectedMemory) return null;
    return memoryEntries.find((e) => e.id === selectedMemory.id) || selectedMemory;
  }, [selectedMemory, memoryEntries]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient
        colors={C.gradient.ocean}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Memory</Text>
          <View style={styles.headerRight}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{memoryEntries.length}</Text>
            </View>
            <Pressable
              style={styles.headerBtn}
              onPress={() => {
                setShowSortModal(true);
                Haptics.selectionAsync();
              }}
            >
              <Ionicons name="swap-vertical-outline" size={18} color={sortOption !== 'newest' ? C.coral : C.textSecondary} />
            </Pressable>
            {gatewayStatus === 'connected' && (
              <Pressable
                style={styles.headerBtn}
                onPress={handleSyncMemory}
              >
                <Ionicons name="cloud-download-outline" size={18} color={syncingMemory ? C.coral : C.textSecondary} />
              </Pressable>
            )}
            <Pressable
              testID="create-memory-btn"
              style={styles.headerBtn}
              onPress={() => {
                setShowCreateModal(true);
                Haptics.selectionAsync();
              }}
            >
              <Ionicons name="add" size={20} color={C.textSecondary} />
            </Pressable>
            <Pressable
              style={styles.headerBtn}
              onPress={() => {
                setShowTagBrowser(!showTagBrowser);
                Haptics.selectionAsync();
              }}
            >
              <Ionicons name="pricetags-outline" size={18} color={showTagBrowser ? C.coral : C.textSecondary} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      {deferredCount > 0 && reviewFilter !== 'deferred' && (
        <Pressable
          style={styles.deferredBanner}
          onPress={() => {
            setReviewFilter('deferred');
            Haptics.selectionAsync();
          }}
        >
          <Card variant="cardElevated" style={styles.deferredBannerGrad}>
            <Ionicons name="time" size={18} color="#8B7FFF" />
            <Text style={styles.deferredBannerText}>
              {deferredCount} deferred note{deferredCount !== 1 ? 's' : ''} to review
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#8B7FFF" />
          </Card>
        </Pressable>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search memories, tags, content..."
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

      {memoryEntries.length > 0 && (
        <View style={[styles.digestCard, C.shadow.elevated as any]}>
          <Card
            variant="cardElevated"
            style={styles.digestGradient}
          >
            <View style={styles.digestHeader}>
              <MaterialCommunityIcons name="chart-box-outline" size={16} color={C.coral} />
              <Text style={styles.digestTitle}>Memory Digest</Text>
            </View>
            <View style={styles.digestGrid}>
              <View style={styles.digestStat}>
                <Text style={styles.digestStatValue}>{digestStats.total}</Text>
                <Text style={styles.digestStatLabel}>Total</Text>
              </View>
              <View style={styles.digestStat}>
                <Text style={styles.digestStatValue}>{digestStats.thisWeek}</Text>
                <Text style={styles.digestStatLabel}>This Week</Text>
              </View>
              <View style={styles.digestStat}>
                <Text style={[styles.digestStatValue, { color: C.secondary, fontSize: 13 }]}>{digestStats.topSource}</Text>
                <Text style={styles.digestStatLabel}>Top Source</Text>
              </View>
              <View style={styles.digestStat}>
                <Text style={[styles.digestStatValue, { color: C.accent, fontSize: 13 }]}>{digestStats.topTag}</Text>
                <Text style={styles.digestStatLabel}>Top Tag</Text>
              </View>
            </View>
          </Card>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewFilterRow}>
        {REVIEW_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.reviewChip, reviewFilter === f.key && styles.reviewChipActive]}
            onPress={() => {
              setReviewFilter(f.key);
              Haptics.selectionAsync();
            }}
          >
            <Ionicons name={f.icon as any} size={14} color={reviewFilter === f.key ? C.coral : C.textSecondary} />
            <Text style={[styles.reviewChipText, reviewFilter === f.key && styles.reviewChipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {([
          { key: 'all', label: 'All' },
          { key: 'conversation', label: 'Chats' },
          { key: 'note', label: 'Notes' },
          { key: 'task', label: 'Tasks' },
          { key: 'event', label: 'Events' },
          { key: 'summary', label: 'Summaries' },
          { key: 'document', label: 'Docs' },
        ] as const).map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {showTagBrowser && allTags.length > 0 && (
        <View style={styles.tagBrowser}>
          <View style={styles.tagCloudHeader}>
            <Text style={styles.tagBrowserTitle}>Tag Cloud</Text>
            {selectedTag && (
              <Pressable onPress={() => { setSelectedTag(null); Haptics.selectionAsync(); }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: C.coral }}>Clear</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.tagCloud}>
            {allTags.map((tag, i) => {
              const freq = tagFrequencies[tag] || 1;
              const ratio = freq / maxTagFreq;
              const fontSize = 11 + Math.round(ratio * 5);
              const tagColor = TAG_CLOUD_COLORS[i % TAG_CLOUD_COLORS.length];
              const isActive = selectedTag === tag;
              return (
                <Pressable
                  key={tag}
                  style={[
                    styles.tagCloudItem,
                    { backgroundColor: tagColor + (isActive ? '25' : '12'), borderColor: isActive ? tagColor + '50' : 'transparent' },
                  ]}
                  onPress={() => { setSelectedTag(isActive ? null : tag); Haptics.selectionAsync(); }}
                >
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize, color: isActive ? tagColor : tagColor + 'CC' }}>{tag}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 9, color: C.textTertiary }}>{freq}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {selectedTag && (
        <Pressable style={styles.activeTagBanner} onPress={() => setSelectedTag(null)}>
          <Ionicons name="pricetag" size={12} color={C.accent} />
          <Text style={styles.activeTagText}>Filtered by: {selectedTag}</Text>
          <Ionicons name="close" size={14} color={C.textSecondary} />
        </Pressable>
      )}

      {gatewayStatus === 'connected' && (
        <Pressable
          style={styles.syncBanner}
          onPress={handleSyncMemory}
          disabled={syncingMemory}
        >
          <Ionicons name={syncingMemory ? 'sync' : 'cloud-download-outline'} size={16} color={C.secondary} />
          <Text style={styles.syncBannerText}>
            {syncingMemory ? 'Syncing from gateway...' : `Sync from gateway${gatewayMemoryFiles.length > 0 ? ` (${gatewayMemoryFiles.length} files)` : ''}`}
          </Text>
          {gatewayMemoryFiles.length > 0 && !syncingMemory && (
            <View style={styles.syncBadge}>
              <Text style={styles.syncBadgeText}>{gatewayMemoryFiles.length}</Text>
            </View>
          )}
        </Pressable>
      )}

      {gatewayMemoryFiles.length > 0 && (
        <View style={styles.gatewayMemorySection}>
          <Text style={styles.gatewayMemoryTitle}>Gateway Memory Files</Text>
          {gatewayMemoryFiles.map((file) => (
            <Pressable
              key={file.path}
              style={styles.gatewayMemoryCard}
              onPress={() => {
                Haptics.selectionAsync();
                const entry: MemoryEntry = {
                  id: `gw-${file.path}`,
                  type: file.type === 'memory' ? 'document' : file.type === 'session-state' ? 'summary' : 'note',
                  title: file.name,
                  content: file.content,
                  timestamp: file.lastModified,
                  source: 'agent',
                  tags: [file.type],
                  pinned: file.type === 'memory',
                  reviewStatus: 'unread',
                };
                setSelectedMemory(entry);
                setShowDetailModal(true);
              }}
            >
              <View style={styles.gatewayMemoryIcon}>
                <Ionicons
                  name={file.type === 'memory' ? 'hardware-chip' : file.type === 'session-state' ? 'flash' : 'document-text'}
                  size={18}
                  color={file.type === 'memory' ? C.purple : file.type === 'session-state' ? C.amber : C.coral}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gatewayMemoryName}>{file.name}</Text>
                <Text style={styles.gatewayMemoryPreview} numberOfLines={2}>{file.content.slice(0, 120)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
            </Pressable>
          ))}
        </View>
      )}

      <FlatList
        data={flatData}
        scrollEnabled={!!flatData.length}
        keyExtractor={(item, i) => item.type === 'header' ? `header-${i}-${item.label}` : `item-${item.entry.id}`}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <DateHeader label={item.label} />;
          }
          return (
            <MemoryItem
              item={item.entry}
              onPin={() => handlePin(item.entry.id, item.entry.pinned)}
              onReview={() => handleReview(item.entry.id)}
              onDefer={() => handleDefer(item.entry.id, item.entry.reviewStatus)}
              onPress={() => openDetail(item.entry)}
            />
          );
        }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
          flatData.length === 0 && styles.emptyContainer,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <LinearGradient
              colors={[C.coral + '20', C.accent + '15', C.purple + '10']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyIconBg}
            >
              <MaterialCommunityIcons name="brain" size={44} color={C.textSecondary} />
            </LinearGradient>
            <Text style={styles.emptyTitle}>
              {search || selectedTag ? 'No results found' : 'No memories yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search
                ? 'Try a different search term'
                : selectedTag
                  ? `No memories tagged "${selectedTag}"`
                  : 'Your conversations and tasks will appear here'}
            </Text>
          </View>
        }
      />

      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <Pressable style={styles.sortOverlay} onPress={() => setShowSortModal(false)}>
          <View style={styles.sortModal}>
            <Text style={styles.sortModalTitle}>Sort By</Text>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.sortOption, sortOption === opt.key && styles.sortOptionActive]}
                onPress={() => {
                  setSortOption(opt.key);
                  setShowSortModal(false);
                  Haptics.selectionAsync();
                }}
              >
                <Ionicons name={opt.icon as any} size={16} color={sortOption === opt.key ? C.coral : C.textSecondary} />
                <Text style={[styles.sortOptionText, sortOption === opt.key && styles.sortOptionTextActive]}>{opt.label}</Text>
                {sortOption === opt.key && <Ionicons name="checkmark" size={16} color={C.coral} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <MemoryDetailModal
        item={currentSelectedMemory}
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onPin={() => {
          if (currentSelectedMemory) handlePin(currentSelectedMemory.id, currentSelectedMemory.pinned);
        }}
        onReview={() => {
          if (currentSelectedMemory) handleReview(currentSelectedMemory.id);
        }}
        onDefer={() => {
          if (currentSelectedMemory) handleDefer(currentSelectedMemory.id, currentSelectedMemory.reviewStatus);
        }}
        onDelete={() => {
          if (!currentSelectedMemory) return;
          const doDelete = () => {
            deleteMemoryEntry(currentSelectedMemory.id);
            setShowDetailModal(false);
            setSelectedMemory(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          };
          if (Platform.OS === 'web') {
            doDelete();
          } else {
            Alert.alert('Delete Entry', 'Are you sure you want to delete this memory entry?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: doDelete },
            ]);
          }
        }}
      />

      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={modalStyles.handle} />
            <ScrollView style={modalStyles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={createStyles.headerRow}>
                <Text style={modalStyles.title}>New Memory Entry</Text>
                <Pressable onPress={() => setShowCreateModal(false)}>
                  <Ionicons name="close" size={22} color={C.textSecondary} />
                </Pressable>
              </View>

              <Text style={createStyles.label}>Title</Text>
              <TextInput
                style={createStyles.input}
                placeholder="Entry title..."
                placeholderTextColor={C.textTertiary}
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <Text style={createStyles.label}>Content</Text>
              <TextInput
                style={[createStyles.input, createStyles.inputMultiline]}
                placeholder="Write your note, thought, or content..."
                placeholderTextColor={C.textTertiary}
                value={newContent}
                onChangeText={setNewContent}
                multiline
                textAlignVertical="top"
              />

              <Text style={createStyles.label}>Tags</Text>
              <TextInput
                style={createStyles.input}
                placeholder="strategy, design, notes"
                placeholderTextColor={C.textTertiary}
                value={newTags}
                onChangeText={setNewTags}
              />

              <Text style={createStyles.label}>Type</Text>
              <View style={createStyles.typeRow}>
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <Pressable
                    key={key}
                    style={[
                      createStyles.typePill,
                      newType === key && { backgroundColor: cfg.color + '25', borderColor: cfg.color + '50' },
                    ]}
                    onPress={() => setNewType(key as MemoryEntry['type'])}
                  >
                    <Ionicons name={cfg.icon as any} size={14} color={newType === key ? cfg.color : C.textTertiary} />
                    <Text style={[createStyles.typePillText, newType === key && { color: cfg.color }]}>{cfg.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={async () => {
                  if (!newTitle.trim() || !newContent.trim()) return;
                  const parsedTags = newTags
                    .split(',')
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0);
                  await createMemoryEntry({
                    title: newTitle.trim(),
                    content: newContent.trim(),
                    type: newType,
                    tags: parsedTags.length > 0 ? parsedTags : undefined,
                    source: 'manual',
                    reviewStatus: 'unread',
                  });
                  setNewTitle('');
                  setNewContent('');
                  setNewTags('');
                  setNewType('note');
                  setShowCreateModal(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
              >
                <LinearGradient
                  colors={C.gradient.lobster}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[createStyles.createBtn, (!newTitle.trim() || !newContent.trim()) && { opacity: 0.5 }]}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={createStyles.createBtnText}>Create Entry</Text>
                </LinearGradient>
              </Pressable>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: '50%',
    borderWidth: 1,
    borderColor: C.borderLight,
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.textTertiary,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: C.text,
    marginBottom: 12,
    lineHeight: 28,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sourceText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.textSecondary,
    textTransform: 'capitalize' as const,
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  reviewText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    textTransform: 'capitalize' as const,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: C.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  contentText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 22,
  },
  summaryBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: C.accent + '10',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.accent + '20',
  },
  summaryText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.accent,
    lineHeight: 20,
    flex: 1,
  },
  relevanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  relevanceBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: C.surface,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  relevanceBarFill: {
    height: 6,
    borderRadius: 3,
  },
  relevanceValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.secondary,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.accent + '15',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.accent,
  },
  linkedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  linkedText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
  },
  timestampText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textSecondary,
  },
  actionBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: C.surface,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.card,
  },
  actionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: C.textSecondary,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  deleteBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: C.error,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  headerGradient: { paddingBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: C.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { backgroundColor: C.primaryMuted, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  countText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.primary },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  deferredBanner: { marginHorizontal: 20, marginBottom: 8 },
  deferredBannerGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#8B7FFF30' },
  deferredBannerText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#8B7FFF', flex: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, marginHorizontal: 20, gap: 10, borderWidth: 1, borderColor: C.borderLight, height: 44 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: C.text, height: 44 },
  reviewFilterRow: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4, gap: 6 },
  reviewChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.card },
  reviewChipActive: { backgroundColor: C.coral + '15' },
  reviewChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary },
  reviewChipTextActive: { color: C.coral },
  filterRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight },
  filterChipActive: { backgroundColor: C.primaryMuted, borderColor: C.primary },
  filterChipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary },
  filterChipTextActive: { color: C.primary },
  tagBrowser: { marginHorizontal: 20, marginBottom: 4, backgroundColor: C.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.borderLight },
  tagBrowserTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  tagCloudHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagCloudItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  activeTagBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.accent + '12', borderRadius: 8, marginBottom: 4 },
  activeTagText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.accent, flex: 1 },
  listContent: { paddingHorizontal: 20 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  dateLine: { flex: 1, height: 1, backgroundColor: C.borderLight },
  dateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  memoryItem: { flexDirection: 'row', gap: 0, marginBottom: 2 },
  timelineCol: { alignItems: 'center', width: 20, paddingTop: 6 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLine: { flex: 1, width: 1, backgroundColor: C.borderLight, marginTop: 4 },
  memoryCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.borderLight, gap: 6, marginBottom: 6 },
  memoryCardPinned: { borderColor: C.coral + '30' },
  memoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeIcon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  memoryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text, flex: 1 },
  memorySummary: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.accent, lineHeight: 16, opacity: 0.85 },
  memoryText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  relevanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  relevanceLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
  relevanceBarBg: { flex: 1, height: 3, backgroundColor: C.surface, borderRadius: 2, maxWidth: 60 },
  relevanceBarFill: { height: 3, backgroundColor: C.secondary, borderRadius: 2 },
  relevanceValue: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.secondary },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accent + '12', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagChipText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.accent },
  memoryFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  sourceTextBadge: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary, textTransform: 'capitalize' },
  reviewBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  reviewBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 10, textTransform: 'capitalize' },
  memoryTime: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary, marginLeft: 'auto' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 6 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 6, backgroundColor: C.surface },
  actionBtnLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.textTertiary },
  digestCard: { marginHorizontal: 20, marginTop: 10, marginBottom: 2, borderRadius: 12 },
  digestGradient: { borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.borderLight },
  digestHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  digestTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.text },
  digestGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  digestStat: { alignItems: 'center', flex: 1 },
  digestStatValue: { fontFamily: 'Inter_700Bold', fontSize: 18, color: C.coral },
  digestStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary, marginTop: 2 },
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  emptyIconBg: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: C.textSecondary, marginTop: 8 },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary, textAlign: 'center' },
  sortOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sortModal: { backgroundColor: C.card, borderRadius: 14, padding: 16, width: 240, borderWidth: 1, borderColor: C.borderLight },
  sortModalTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text, marginBottom: 12, textAlign: 'center' },
  sortOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  sortOptionActive: { backgroundColor: C.coral + '12' },
  sortOptionText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary, flex: 1 },
  sortOptionTextActive: { color: C.coral },
  syncBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 8, backgroundColor: C.secondaryMuted, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: C.secondary + '20' },
  syncBannerText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.secondary, flex: 1 },
  syncBadge: { backgroundColor: C.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, minWidth: 20, alignItems: 'center' },
  syncBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#fff' },
  gatewayMemorySection: { paddingHorizontal: 20, marginBottom: 12 },
  gatewayMemoryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  gatewayMemoryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: C.borderLight },
  gatewayMemoryIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  gatewayMemoryName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text },
  gatewayMemoryPreview: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, marginTop: 2, lineHeight: 16 },
});

const createStyles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: C.textTertiary, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.borderLight, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' as const },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight },
  typePillText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textTertiary },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  createBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#fff' },
});
