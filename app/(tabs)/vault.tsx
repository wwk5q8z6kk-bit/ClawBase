import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  Animated,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Swipeable } from 'react-native-gesture-handler';
import Colors from '@/constants/colors';
import { useToast } from '@/components/Toast';
import { useApp } from '@/lib/AppContext';
import type { Task, TaskStatus, MemoryEntry, InboxItem } from '@/lib/types';
import {
  getCategoryIcon,
  getCategoryColor,
  getPriorityLabel,
  formatParsedDate,
} from '@/lib/brainDump';
import type { GatewayMemoryFile } from '@/lib/gateway';
import { inboxStorage } from '@/lib/storage';
import { getLinksFor, addLink, removeLink, type EntityLink, type EntityType } from '@/lib/entityLinks';
import { getAllMindMaps, createMindMap, deleteMindMap, type MindMap } from '@/lib/mindmap';
import { router, useLocalSearchParams } from 'expo-router';

const C = Colors.dark;

type VaultSegment = 'inbox' | 'tasks' | 'knowledge' | 'files';

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: string }> = {
  todo: { label: 'To Do', color: C.textSecondary, icon: 'ellipse-outline' },
  in_progress: { label: 'In Progress', color: C.amber, icon: 'time-outline' },
  done: { label: 'Done', color: C.success, icon: 'checkmark-circle' },
  deferred: { label: 'Deferred', color: '#8B7FFF', icon: 'pause-circle-outline' },
  archived: { label: 'Archived', color: C.textTertiary, icon: 'archive-outline' },
};

const KANBAN_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'To Do', color: C.textSecondary },
  { status: 'in_progress', label: 'In Progress', color: C.amber },
  { status: 'done', label: 'Done', color: C.success },
  { status: 'deferred', label: 'Deferred', color: '#8B7FFF' },
  { status: 'archived', label: 'Archived', color: C.textTertiary },
];

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  urgent: { color: C.primary, label: 'Urgent' },
  high: { color: C.amber, label: 'High' },
  medium: { color: C.accent, label: 'Medium' },
  low: { color: C.textSecondary, label: 'Low' },
};

type ViewMode = 'list' | 'board';
type TaskSortMode = 'priority' | 'dueDate' | 'newest' | 'alphabetical';

const TASK_SORT_OPTIONS: { key: TaskSortMode; label: string; icon: string }[] = [
  { key: 'priority', label: 'Priority', icon: 'flag-outline' },
  { key: 'dueDate', label: 'Due Date', icon: 'calendar-outline' },
  { key: 'newest', label: 'Newest First', icon: 'time-outline' },
  { key: 'alphabetical', label: 'Alphabetical', icon: 'text-outline' },
];

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

type MemorySortOption = 'newest' | 'oldest' | 'relevance' | 'alphabetical';

const MEMORY_SORT_OPTIONS: { key: MemorySortOption; label: string; icon: string }[] = [
  { key: 'newest', label: 'Newest First', icon: 'arrow-down-outline' },
  { key: 'oldest', label: 'Oldest First', icon: 'arrow-up-outline' },
  { key: 'relevance', label: 'By Relevance', icon: 'trending-up-outline' },
  { key: 'alphabetical', label: 'Alphabetical', icon: 'text-outline' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_PROGRESS: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 0.5,
  done: 1,
  deferred: 0.25,
  archived: 0,
};

function formatAge(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDueDate(ts: number): { text: string; isOverdue: boolean } {
  const d = new Date(ts);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const isOverdue = ts < now.getTime();
  return { text: `Due ${MONTHS[d.getMonth()]} ${d.getDate()}`, isOverdue };
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${d.getHours() % 12 || 12}:${d.getMinutes().toString().padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

function parseDueDateInput(input: string): number | undefined {
  if (!input.trim()) return undefined;
  const trimmed = input.trim();
  const now = new Date();
  const year = now.getFullYear();

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10) - 1;
    const day = parseInt(slashMatch[2], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      if (d < now) d.setFullYear(year + 1);
      return d.getTime();
    }
  }

  const monthNames: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const namedMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{1,2})$/);
  if (namedMatch) {
    const monthKey = namedMatch[1].toLowerCase().slice(0, 3);
    const month = monthNames[monthKey];
    const day = parseInt(namedMatch[2], 10);
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      if (d < now) d.setFullYear(year + 1);
      return d.getTime();
    }
  }
  return undefined;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

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

const TaskCard = React.memo(function TaskCard({
  task,
  onPress,
  onLongPress,
  onStatusChange,
}: {
  task: Task;
  onPress: () => void;
  onLongPress: () => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  const status = STATUS_CONFIG[task.status];
  const priority = PRIORITY_CONFIG[task.priority];
  const ago = formatAge(task.updatedAt);
  const statusCycle: TaskStatus[] = ['todo', 'in_progress', 'done', 'deferred', 'archived'];

  return (
    <Pressable
      style={({ pressed }) => [styles.taskCard, pressed && { backgroundColor: C.cardElevated }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.taskCardTop}>
        <Pressable
          onPress={() => {
            const currentIdx = statusCycle.indexOf(task.status);
            const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length];
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onStatusChange(task.id, nextStatus);
          }}
          style={[styles.statusIconBg, { backgroundColor: status.color + '18' }]}
        >
          <Ionicons name={status.icon as any} size={22} color={status.color} />
        </Pressable>
        <View style={styles.taskCardContent}>
          <Text
            style={[
              styles.taskTitle,
              task.status === 'done' && styles.taskTitleDone,
              task.status === 'archived' && styles.taskTitleArchived,
            ]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          {task.description ? (
            <Text style={styles.taskDesc} numberOfLines={1}>{task.description}</Text>
          ) : null}
        </View>
      </View>

      {(task.dueDate || task.assignee) && (
        <View style={styles.taskMetaRow}>
          {task.dueDate ? (() => {
            const { text, isOverdue } = formatDueDate(task.dueDate);
            return (
              <View style={styles.dueDatePill}>
                <Ionicons name="time-outline" size={11} color={isOverdue ? C.primary : C.textSecondary} />
                <Text style={[styles.dueDateText, isOverdue && { color: C.primary }]}>{text}</Text>
              </View>
            );
          })() : null}
          {task.assignee ? (
            <View style={styles.assigneePill}>
              <View style={styles.assigneeAvatar}>
                <Text style={styles.assigneeInitials}>{getInitials(task.assignee)}</Text>
              </View>
              <Text style={styles.assigneeName} numberOfLines={1}>{task.assignee}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.taskCardBottom}>
        <View style={[styles.priorityPill, { backgroundColor: priority.color + '18' }]}>
          <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
          <Text style={[styles.priorityText, { color: priority.color }]}>{priority.label}</Text>
        </View>
        {task.tags && task.tags.length > 0 && (
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>{task.tags[0]}</Text>
          </View>
        )}
        {task.source && (
          <View style={styles.sourcePill}>
            <Ionicons name="link-outline" size={10} color={C.textTertiary} />
            <Text style={styles.sourceText}>{task.source}</Text>
          </View>
        )}
        <Text style={styles.taskAge}>{ago}</Text>
      </View>
    </Pressable>
  );
});

function SwipeableTaskCard({
  task,
  onPress,
  onLongPress,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  onPress: () => void;
  onLongPress: () => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (task: Task) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = useCallback(() => (
    <Pressable
      style={styles.swipeActionDelete}
      onPress={() => {
        swipeableRef.current?.close();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onDelete(task);
      }}
    >
      <Ionicons name="trash" size={22} color="#fff" />
      <Text style={styles.swipeActionText}>Delete</Text>
    </Pressable>
  ), [task, onDelete]);

  const renderLeftActions = useCallback(() => (
    <Pressable
      style={styles.swipeActionComplete}
      onPress={() => {
        swipeableRef.current?.close();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onStatusChange(task.id, 'done');
      }}
    >
      <Ionicons name="checkmark-circle" size={22} color="#fff" />
      <Text style={styles.swipeActionText}>Complete</Text>
    </Pressable>
  ), [task, onStatusChange]);

  if (Platform.OS === 'web') {
    return (
      <TaskCard
        task={task}
        onPress={onPress}
        onLongPress={onLongPress}
        onStatusChange={onStatusChange}
      />
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
      friction={2}
    >
      <TaskCard
        task={task}
        onPress={onPress}
        onLongPress={onLongPress}
        onStatusChange={onStatusChange}
      />
    </Swipeable>
  );
}

function StatsBar({ tasks }: { tasks: Task[] }) {
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const inProg = tasks.filter((t) => t.status === 'in_progress').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const deferred = tasks.filter((t) => t.status === 'deferred').length;
  const archived = tasks.filter((t) => t.status === 'archived').length;
  const total = tasks.length || 1;

  const stats: { count: number; label: string; color: string; icon: string }[] = [
    { count: todo, label: 'To Do', color: C.textSecondary, icon: 'ellipse-outline' },
    { count: inProg, label: 'Active', color: C.amber, icon: 'time-outline' },
    { count: done, label: 'Done', color: C.success, icon: 'checkmark-circle' },
    { count: deferred, label: 'Deferred', color: '#8B7FFF', icon: 'pause-circle-outline' },
    { count: archived, label: 'Archived', color: C.textTertiary, icon: 'archive-outline' },
  ];

  return (
    <View style={styles.statsBar}>
      <View style={styles.statsItems}>
        {stats.map((s) => (
          <View key={s.label} style={styles.statsItem}>
            <Ionicons name={s.icon as any} size={16} color={s.color} style={{ marginBottom: 4 }} />
            <Text style={[styles.statsNum, { color: s.color }]}>{s.count}</Text>
            <Text style={styles.statsLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.progressTrack}>
        {done > 0 && <View style={[styles.progressSeg, { flex: done / total, backgroundColor: C.success }]} />}
        {inProg > 0 && <View style={[styles.progressSeg, { flex: inProg / total, backgroundColor: C.amber }]} />}
        {deferred > 0 && <View style={[styles.progressSeg, { flex: deferred / total, backgroundColor: '#8B7FFF' }]} />}
        {todo > 0 && <View style={[styles.progressSeg, { flex: todo / total, backgroundColor: C.textTertiary }]} />}
      </View>
    </View>
  );
}

function MoveToModal({
  visible,
  task,
  onClose,
  onMove,
}: {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
  onMove: (taskId: string, status: TaskStatus) => void;
}) {
  if (!task) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.moveOverlay} onPress={onClose}>
        <View style={styles.moveSheet}>
          <Text style={styles.moveTitle}>Move Task</Text>
          <Text style={styles.moveTaskName} numberOfLines={1}>{task.title}</Text>
          <View style={styles.moveOptions}>
            {KANBAN_COLUMNS.map((col) => {
              const isActive = task.status === col.status;
              return (
                <Pressable
                  key={col.status}
                  style={[styles.moveOption, isActive && { backgroundColor: col.color + '20', borderColor: col.color }]}
                  onPress={() => {
                    if (!isActive) {
                      onMove(task.id, col.status);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                    onClose();
                  }}
                >
                  <View style={[styles.moveOptionDot, { backgroundColor: col.color }]} />
                  <Text style={[styles.moveOptionText, isActive && { color: col.color }]}>{col.label}</Text>
                  {isActive && <Ionicons name="checkmark" size={16} color={col.color} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const ENTITY_TYPE_CONFIG: Record<EntityType, { icon: string; color: string; label: string }> = {
  conversation: { icon: 'chatbubble', color: C.accent, label: 'Conversation' },
  task: { icon: 'checkbox', color: C.amber, label: 'Task' },
  memory: { icon: 'book', color: '#8B7FFF', label: 'Memory' },
  calendar: { icon: 'calendar', color: C.coral, label: 'Event' },
  contact: { icon: 'person', color: C.textSecondary, label: 'Contact' },
  mindmap: { icon: 'git-network-outline', color: C.accent, label: 'Mind Map' },
};

function EntityLinksSection({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const [links, setLinks] = useState<EntityLink[]>([]);
  const { conversations, tasks, memoryEntries, calendarEvents, crmContacts } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<EntityType | ''>('');
  const [pickerSearch, setPickerSearch] = useState('');

  React.useEffect(() => {
    getLinksFor(entityType, entityId).then(setLinks).catch((e) => console.warn('[vault] Failed to load entity links:', e));
  }, [entityType, entityId, refreshKey]);

  React.useEffect(() => {
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLinkPress = (link: EntityLink) => {
    const targetType = link.sourceType === entityType && link.sourceId === entityId
      ? link.targetType
      : link.sourceType;
    const targetId = link.sourceType === entityType && link.sourceId === entityId
      ? link.targetId
      : link.sourceId;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (targetType === 'conversation') {
      router.push(`/chat/${targetId}`);
    } else if (targetType === 'task') {
      router.push({ pathname: '/(tabs)/vault', params: { openTaskId: targetId } });
    } else if (targetType === 'memory') {
      router.push({ pathname: '/(tabs)/vault', params: { openMemoryId: targetId } });
    } else if (targetType === 'calendar') {
      router.push({ pathname: '/(tabs)/calendar', params: { openEventId: targetId } });
    } else if (targetType === 'contact') {
      router.push({ pathname: '/crm', params: { openContactId: targetId } } as any);
    } else if (targetType === 'mindmap') {
      router.push({ pathname: '/mindmap', params: { id: targetId } } as any);
    }
  };

  const getLinkLabel = (link: EntityLink): string => {
    const isSource = link.sourceType === entityType && link.sourceId === entityId;
    const otherType = isSource ? link.targetType : link.sourceType;
    const otherId = isSource ? link.targetId : link.sourceId;
    const config = ENTITY_TYPE_CONFIG[otherType];
    if (otherType === 'conversation') {
      const conv = conversations.find((c) => c.id === otherId);
      return conv ? conv.title : config.label;
    }
    if (otherType === 'task') {
      const t = tasks.find((t) => t.id === otherId);
      return t ? t.title : config.label;
    }
    if (otherType === 'memory') {
      const m = memoryEntries.find((m) => m.id === otherId);
      return m ? m.title : config.label;
    }
    if (otherType === 'contact') {
      const c = crmContacts.find((c) => c.id === otherId);
      return c ? c.name : config.label;
    }
    if (otherType === 'calendar') {
      const e = calendarEvents.find((e) => e.id === otherId);
      return e ? e.title : config.label;
    }
    return `${config.label} (${link.relation.replace(/_/g, ' ')})`;
  };

  const linkedIds = new Set(links.flatMap(l => [
    `${l.sourceType}:${l.sourceId}`,
    `${l.targetType}:${l.targetId}`,
  ]));
  linkedIds.delete(`${entityType}:${entityId}`);

  const pickerItems = React.useMemo(() => {
    const items: { type: EntityType; id: string; name: string }[] = [];
    const q = pickerSearch.toLowerCase();
    const filterType = pickerFilter || null;

    if (!filterType || filterType === 'task') {
      for (const t of tasks) {
        if (t.id === entityId && entityType === 'task') continue;
        if (linkedIds.has(`task:${t.id}`)) continue;
        if (q && !t.title.toLowerCase().includes(q)) continue;
        items.push({ type: 'task', id: t.id, name: t.title });
      }
    }
    if (!filterType || filterType === 'memory') {
      for (const m of memoryEntries) {
        if (m.id === entityId && entityType === 'memory') continue;
        if (linkedIds.has(`memory:${m.id}`)) continue;
        if (q && !m.title.toLowerCase().includes(q)) continue;
        items.push({ type: 'memory', id: m.id, name: m.title });
      }
    }
    if (!filterType || filterType === 'contact') {
      for (const c of crmContacts) {
        if (c.id === entityId && entityType === 'contact') continue;
        if (linkedIds.has(`contact:${c.id}`)) continue;
        if (q && !c.name.toLowerCase().includes(q)) continue;
        items.push({ type: 'contact', id: c.id, name: c.name });
      }
    }
    if (!filterType || filterType === 'calendar') {
      for (const e of calendarEvents) {
        if (e.id === entityId && entityType === 'calendar') continue;
        if (linkedIds.has(`calendar:${e.id}`)) continue;
        if (q && !e.title.toLowerCase().includes(q)) continue;
        items.push({ type: 'calendar', id: e.id, name: e.title });
      }
    }
    if (!filterType || filterType === 'conversation') {
      for (const c of conversations) {
        if (c.id === entityId && entityType === 'conversation') continue;
        if (linkedIds.has(`conversation:${c.id}`)) continue;
        if (q && !c.title.toLowerCase().includes(q)) continue;
        items.push({ type: 'conversation', id: c.id, name: c.title });
      }
    }
    return items.slice(0, 20);
  }, [pickerFilter, pickerSearch, tasks, memoryEntries, crmContacts, calendarEvents, conversations, linkedIds]);

  const handleAddLink = async (targetType: EntityType, targetId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await addLink(entityType, entityId, targetType, targetId, 'related_to');
    setRefreshKey(k => k + 1);
    setShowLinkPicker(false);
    setPickerSearch('');
    setPickerFilter('');
  };

  const filterTypes: { key: EntityType | ''; label: string }[] = [
    { key: '', label: 'All' },
    { key: 'task', label: 'Tasks' },
    { key: 'memory', label: 'Memory' },
    { key: 'contact', label: 'Contacts' },
    { key: 'calendar', label: 'Events' },
  ];

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={linkStyles.sectionLabel}>Linked Items</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowLinkPicker(true);
          }}
          style={({ pressed }) => [linkStyles.addBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="add" size={14} color={C.accent} />
          <Text style={linkStyles.addBtnText}>Link</Text>
        </Pressable>
      </View>
      {links.length > 0 && (
        <View style={linkStyles.chipsRow}>
          {links.map((link) => {
            const isSource = link.sourceType === entityType && link.sourceId === entityId;
            const otherType = isSource ? link.targetType : link.sourceType;
            const config = ENTITY_TYPE_CONFIG[otherType];
            return (
              <Pressable
                key={link.id}
                onPress={() => handleLinkPress(link)}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  Alert.alert('Remove Link', 'Remove this connection?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: async () => {
                      await removeLink(link.id);
                      setRefreshKey(k => k + 1);
                    }},
                  ]);
                }}
                style={({ pressed }) => [linkStyles.chip, { borderColor: config.color + '40' }, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={config.icon as any} size={12} color={config.color} />
                <Text style={[linkStyles.chipText, { color: config.color }]} numberOfLines={1}>
                  {getLinkLabel(link)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Modal visible={showLinkPicker} transparent animationType="slide" onRequestClose={() => setShowLinkPicker(false)}>
        <View style={linkStyles.pickerOverlay}>
          <Pressable style={linkStyles.pickerBg} onPress={() => setShowLinkPicker(false)} />
          <View style={linkStyles.pickerSheet}>
            <View style={linkStyles.pickerHandle} />
            <Text style={linkStyles.pickerTitle}>Link to...</Text>

            <View style={linkStyles.pickerSearchBar}>
              <Ionicons name="search" size={16} color={C.textTertiary} />
              <TextInput
                style={linkStyles.pickerSearchInput}
                placeholder="Search items..."
                placeholderTextColor={C.textTertiary}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                autoCapitalize="none"
                selectionColor={C.primary}
              />
            </View>

            <View style={linkStyles.pickerFilters}>
              {filterTypes.map(ft => (
                <Pressable
                  key={ft.key}
                  style={[linkStyles.pickerFilterChip, pickerFilter === ft.key && linkStyles.pickerFilterActive]}
                  onPress={() => setPickerFilter(ft.key)}
                >
                  <Text style={[linkStyles.pickerFilterText, pickerFilter === ft.key && { color: C.accent }]}>{ft.label}</Text>
                </Pressable>
              ))}
            </View>

            <FlatList
              data={pickerItems}
              keyExtractor={item => `${item.type}:${item.id}`}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => {
                const config = ENTITY_TYPE_CONFIG[item.type];
                return (
                  <Pressable
                    style={({ pressed }) => [linkStyles.pickerItem, pressed && { backgroundColor: C.surface }]}
                    onPress={() => handleAddLink(item.type, item.id)}
                  >
                    <View style={[linkStyles.pickerItemIcon, { backgroundColor: config.color + '18' }]}>
                      <Ionicons name={config.icon as any} size={14} color={config.color} />
                    </View>
                    <Text style={linkStyles.pickerItemName} numberOfLines={1}>{item.name}</Text>
                    <Ionicons name="add-circle-outline" size={18} color={C.textTertiary} />
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={linkStyles.pickerEmpty}>No items found</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const linkStyles = StyleSheet.create({
  sectionLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary, marginBottom: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 11, maxWidth: 140 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(91,127,255,0.1)',
  },
  addBtnText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.accent },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 40, maxHeight: '70%',
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginTop: 10, marginBottom: 16,
  },
  pickerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: C.text, marginBottom: 12 },
  pickerSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, height: 40,
    marginBottom: 10,
  },
  pickerSearchInput: {
    flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, height: 40,
  },
  pickerFilters: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  pickerFilterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: C.border,
  },
  pickerFilterActive: { borderColor: C.accent, backgroundColor: 'rgba(91,127,255,0.1)' },
  pickerFilterText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.textSecondary },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8,
  },
  pickerItemIcon: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  pickerItemName: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, flex: 1 },
  pickerEmpty: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textTertiary,
    textAlign: 'center', paddingVertical: 20,
  },
});

function TaskDetailModal({
  visible,
  task,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Task>) => void;
  onDelete: (task: Task) => void;
}) {
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState<TaskStatus>('todo');
  const [editPriority, setEditPriority] = useState<Task['priority']>('medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editAssignee, setEditAssignee] = useState('');

  React.useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDesc(task.description || '');
      setEditStatus(task.status);
      setEditPriority(task.priority);
      if (task.dueDate) {
        const d = new Date(task.dueDate);
        setEditDueDate(`${MONTHS[d.getMonth()]} ${d.getDate()}`);
      } else {
        setEditDueDate('');
      }
      setEditTags(task.tags?.join(', ') || '');
      setEditAssignee(task.assignee || '');
    }
     
  }, [task]);

  if (!task) return null;

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const parsedDueDate = parseDueDateInput(editDueDate);
    const parsedTags = editTags.trim()
      ? editTags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined;
    onSave(task.id, {
      title: editTitle.trim() || task.title,
      description: editDesc.trim() || undefined,
      status: editStatus,
      priority: editPriority,
      dueDate: parsedDueDate,
      tags: parsedTags,
      assignee: editAssignee.trim() || undefined,
    });
    onClose();
  };

  const handleDelete = () => {
    onDelete(task);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.detailModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Task Details</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={C.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
            <TextInput
              style={styles.input}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Task title"
              placeholderTextColor={C.textTertiary}
            />

            <Text style={styles.priorityLabel}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {KANBAN_COLUMNS.map((col) => {
                const selected = editStatus === col.status;
                return (
                  <Pressable
                    key={col.status}
                    style={[styles.statusBtn, selected && { backgroundColor: col.color + '20', borderColor: col.color }]}
                    onPress={() => setEditStatus(col.status)}
                  >
                    <View style={[styles.statusBtnDot, { backgroundColor: col.color }]} />
                    <Text style={[styles.statusBtnText, selected && { color: col.color }]}>{col.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.priorityLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                const pConfig = PRIORITY_CONFIG[p];
                const selected = editPriority === p;
                return (
                  <Pressable
                    key={p}
                    style={[styles.priorityBtn, selected && { backgroundColor: pConfig.color + '20', borderColor: pConfig.color }]}
                    onPress={() => setEditPriority(p)}
                  >
                    <Text style={[styles.priorityBtnText, selected && { color: pConfig.color }]}>{pConfig.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={[styles.input, { height: 80 }]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="Description (optional)"
              placeholderTextColor={C.textTertiary}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.priorityLabel}>Due Date</Text>
            <TextInput
              style={styles.input}
              value={editDueDate}
              onChangeText={setEditDueDate}
              placeholder="e.g. Mar 15, 2/20, tomorrow"
              placeholderTextColor={C.textTertiary}
            />

            <Text style={styles.priorityLabel}>Tags</Text>
            <TextInput
              style={styles.input}
              value={editTags}
              onChangeText={setEditTags}
              placeholder="Comma-separated: design, frontend"
              placeholderTextColor={C.textTertiary}
            />

            <Text style={styles.priorityLabel}>Assignee</Text>
            <TextInput
              style={styles.input}
              value={editAssignee}
              onChangeText={setEditAssignee}
              placeholder="Assignee name"
              placeholderTextColor={C.textTertiary}
            />

            {task.source && (
              <View style={styles.detailRow}>
                <Ionicons name="link-outline" size={16} color={C.textSecondary} />
                <View style={styles.sourcePill}>
                  <Text style={styles.sourceText}>{task.source}</Text>
                </View>
              </View>
            )}

            <EntityLinksSection entityType="task" entityId={task.id} />

            <View style={styles.timestampsContainer}>
              <Text style={styles.timestampText}>Created: {formatTimestamp(task.createdAt)}</Text>
              <Text style={styles.timestampText}>Updated: {formatTimestamp(task.updatedAt)}</Text>
            </View>

            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            >
              <LinearGradient colors={C.gradient.lobster} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={handleDelete} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>Delete Task</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BoardColumn({ title, tasks: columnTasks, color, onMove, onDelete }: {
  title: string;
  tasks: Task[];
  color: string;
  onMove: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <View style={styles.boardColumn}>
      <LinearGradient
        colors={[color + '20', color + '08']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.boardColHeaderGradient}
      >
        <View style={[styles.boardColDot, { backgroundColor: color }]} />
        <Text style={styles.boardColTitle}>{title}</Text>
        <View style={styles.boardColCount}>
          <Text style={styles.boardColCountText}>{columnTasks.length}</Text>
        </View>
      </LinearGradient>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 40 }}>
        {columnTasks.map((task) => {
          const progress = STATUS_PROGRESS[task.status];
          const statusColor = STATUS_CONFIG[task.status].color;
          return (
            <Pressable
              key={task.id}
              style={({ pressed }) => [styles.boardTaskCard, pressed && { backgroundColor: C.cardElevated }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onMove(task);
              }}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onDelete(task);
              }}
            >
              <Text style={[styles.boardTaskTitle, task.status === 'done' && styles.taskTitleDone, task.status === 'archived' && styles.taskTitleArchived]} numberOfLines={2}>{task.title}</Text>
              {task.description && <Text style={styles.boardTaskDesc} numberOfLines={1}>{task.description}</Text>}
              {(task.dueDate || task.assignee) && (
                <View style={styles.boardTaskMeta}>
                  {task.dueDate ? (() => {
                    const { text, isOverdue } = formatDueDate(task.dueDate);
                    return (
                      <View style={styles.dueDatePillCompact}>
                        <Ionicons name="time-outline" size={10} color={isOverdue ? C.primary : C.textTertiary} />
                        <Text style={[styles.dueDateTextCompact, isOverdue && { color: C.primary }]}>{text}</Text>
                      </View>
                    );
                  })() : null}
                  {task.assignee ? (
                    <View style={styles.assigneePillCompact}>
                      <View style={styles.assigneeAvatarSmall}>
                        <Text style={styles.assigneeInitialsSmall}>{getInitials(task.assignee)}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}
              <View style={styles.boardTaskFooter}>
                <View style={[styles.priorityPill, { backgroundColor: PRIORITY_CONFIG[task.priority].color + '18' }]}>
                  <View style={[styles.priorityDot, { backgroundColor: PRIORITY_CONFIG[task.priority].color }]} />
                  <Text style={[styles.priorityText, { color: PRIORITY_CONFIG[task.priority].color }]}>{PRIORITY_CONFIG[task.priority].label}</Text>
                </View>
                <Text style={styles.taskAge}>{formatAge(task.updatedAt)}</Text>
              </View>
              <View style={styles.boardProgressTrack}>
                <View style={[styles.boardProgressFill, { width: `${progress * 100}%`, backgroundColor: statusColor }]} />
              </View>
            </Pressable>
          );
        })}
        {columnTasks.length === 0 && (
          <View style={styles.boardEmptyCol}>
            <Text style={styles.boardEmptyText}>No tasks</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
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

const MemoryItem = React.memo(function MemoryItem({
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
              <View key={i} style={styles.memTagChip}>
                <Ionicons name="pricetag-outline" size={9} color={C.accent} />
                <Text style={styles.memTagChipText}>{tag}</Text>
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
          <Pressable style={styles.memActionBtn} onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); onPin(); }}>
            <Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={14} color={item.pinned ? C.coral : C.textTertiary} />
            <Text style={[styles.actionBtnLabel, item.pinned && { color: C.coral }]}>Pin</Text>
          </Pressable>
          <Pressable style={styles.memActionBtn} onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); onReview(); }}>
            <Ionicons name={item.reviewStatus === 'reviewed' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={14} color={item.reviewStatus === 'reviewed' ? C.success : C.textTertiary} />
            <Text style={[styles.actionBtnLabel, item.reviewStatus === 'reviewed' && { color: C.success }]}>Review</Text>
          </Pressable>
          <Pressable style={styles.memActionBtn} onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); onDefer(); }}>
            <Ionicons name="time-outline" size={14} color={item.reviewStatus === 'deferred' ? '#8B7FFF' : C.textTertiary} />
            <Text style={[styles.actionBtnLabel, item.reviewStatus === 'deferred' && { color: '#8B7FFF' }]}>Defer</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
});

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
      <View style={memModalStyles.overlay}>
        <View style={memModalStyles.container}>
          <View style={memModalStyles.handle} />

          <ScrollView style={memModalStyles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={memModalStyles.title}>{item.title}</Text>

            <View style={memModalStyles.badgeRow}>
              <View style={[memModalStyles.typeBadge, { backgroundColor: config.color + '20' }]}>
                <Ionicons name={config.icon as any} size={14} color={config.color} />
                <Text style={[memModalStyles.typeBadgeText, { color: config.color }]}>{config.label}</Text>
              </View>

              {source && (
                <View style={memModalStyles.sourceBadge}>
                  <Ionicons name={source.icon as any} size={12} color={source.color} />
                  <Text style={memModalStyles.sourceText}>{item.source}</Text>
                </View>
              )}

              {item.reviewStatus && (
                <View style={[
                  memModalStyles.reviewBadge,
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
                    memModalStyles.reviewText,
                    item.reviewStatus === 'unread' && { color: C.coral },
                    item.reviewStatus === 'deferred' && { color: '#8B7FFF' },
                    item.reviewStatus === 'reviewed' && { color: C.success },
                  ]}>{item.reviewStatus}</Text>
                </View>
              )}

              {item.pinned && (
                <View style={[memModalStyles.typeBadge, { backgroundColor: C.coral + '18' }]}>
                  <Ionicons name="pin" size={12} color={C.coral} />
                  <Text style={[memModalStyles.typeBadgeText, { color: C.coral }]}>Pinned</Text>
                </View>
              )}
            </View>

            <View style={memModalStyles.section}>
              <Text style={memModalStyles.sectionLabel}>Content</Text>
              <Text style={memModalStyles.contentText}>{item.content}</Text>
            </View>

            {item.summary && (
              <View style={memModalStyles.summaryBox}>
                <Ionicons name="sparkles" size={14} color={C.accent} />
                <Text style={memModalStyles.summaryText}>{item.summary}</Text>
              </View>
            )}

            {typeof item.relevance === 'number' && (
              <View style={memModalStyles.section}>
                <Text style={memModalStyles.sectionLabel}>Relevance</Text>
                <View style={memModalStyles.relevanceRow}>
                  <View style={memModalStyles.relevanceBarBg}>
                    <LinearGradient
                      colors={[C.secondary, C.accent]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[memModalStyles.relevanceBarFill, { width: `${Math.round(item.relevance * 100)}%` }]}
                    />
                  </View>
                  <Text style={memModalStyles.relevanceValue}>{Math.round(item.relevance * 100)}%</Text>
                </View>
              </View>
            )}

            {item.tags && item.tags.length > 0 && (
              <View style={memModalStyles.section}>
                <Text style={memModalStyles.sectionLabel}>Tags</Text>
                <View style={memModalStyles.tagsWrap}>
                  {item.tags.map((tag, i) => (
                    <View key={i} style={memModalStyles.tagChip}>
                      <Ionicons name="pricetag-outline" size={11} color={C.accent} />
                      <Text style={memModalStyles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <EntityLinksSection entityType="memory" entityId={item.id} />

            <View style={memModalStyles.section}>
              <Text style={memModalStyles.sectionLabel}>Timestamp</Text>
              <Text style={memModalStyles.memTimestampText}>{formatFullTimestamp(item.timestamp)}</Text>
            </View>

            <Pressable
              style={memModalStyles.deleteBtn}
              onPress={() => { Haptics.selectionAsync(); onDelete(); }}
            >
              <Ionicons name="trash-outline" size={16} color={C.error} />
              <Text style={memModalStyles.deleteBtnText}>Delete Entry</Text>
            </Pressable>

            <View style={{ height: 80 }} />
          </ScrollView>

          <View style={memModalStyles.actionBar}>
            <Pressable
              style={[memModalStyles.actionBtn, item.pinned && { backgroundColor: C.coral + '20' }]}
              onPress={() => { Haptics.selectionAsync(); onPin(); }}
            >
              <Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={18} color={item.pinned ? C.coral : C.textSecondary} />
              <Text style={[memModalStyles.actionLabel, item.pinned && { color: C.coral }]}>{item.pinned ? 'Unpin' : 'Pin'}</Text>
            </Pressable>
            <Pressable
              style={[memModalStyles.actionBtn, item.reviewStatus === 'reviewed' && { backgroundColor: C.success + '20' }]}
              onPress={() => { Haptics.selectionAsync(); onReview(); }}
            >
              <Ionicons name={item.reviewStatus === 'reviewed' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={item.reviewStatus === 'reviewed' ? C.success : C.textSecondary} />
              <Text style={[memModalStyles.actionLabel, item.reviewStatus === 'reviewed' && { color: C.success }]}>Reviewed</Text>
            </Pressable>
            <Pressable
              style={[memModalStyles.actionBtn, item.reviewStatus === 'deferred' && { backgroundColor: '#8B7FFF20' }]}
              onPress={() => { Haptics.selectionAsync(); onDefer(); }}
            >
              <Ionicons name="time-outline" size={18} color={item.reviewStatus === 'deferred' ? '#8B7FFF' : C.textSecondary} />
              <Text style={[memModalStyles.actionLabel, item.reviewStatus === 'deferred' && { color: '#8B7FFF' }]}>Defer</Text>
            </Pressable>
            <Pressable
              style={memModalStyles.actionBtn}
              onPress={() => { Haptics.selectionAsync(); onClose(); }}
            >
              <Ionicons name="close-outline" size={18} color={C.textSecondary} />
              <Text style={memModalStyles.actionLabel}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type FilterType = 'all' | 'conversation' | 'note' | 'task' | 'event' | 'summary' | 'document';
type ReviewFilter = typeof REVIEW_FILTERS[number]['key'];
const VAULT_SEGMENTS: VaultSegment[] = ['inbox', 'tasks', 'knowledge', 'files'];

function AnimatedSegmentSwitcher({
  activeSegment,
  onSegmentChange,
  tasks,
  memoryEntries,
  gatewayMemoryFiles,
  inboxCount,
}: {
  activeSegment: VaultSegment;
  onSegmentChange: (segment: VaultSegment) => void;
  tasks: Task[];
  memoryEntries: MemoryEntry[];
  gatewayMemoryFiles: GatewayMemoryFile[];
  inboxCount: number;
}) {
  const underlineLeftRef = useRef(new Animated.Value(0)).current;
  const underlineWidthRef = useRef(new Animated.Value(0)).current;
  const segmentWidthsRef = useRef<Record<VaultSegment, number>>({ inbox: 0, tasks: 0, knowledge: 0, files: 0 });

  const labels: Record<VaultSegment, string> = { inbox: 'Inbox', tasks: 'Tasks', knowledge: 'Knowledge', files: 'Files' };

  const counts: Record<VaultSegment, number> = {
    inbox: inboxCount,
    tasks: tasks.filter(t => t.status !== 'archived').length,
    knowledge: memoryEntries.length,
    files: gatewayMemoryFiles.length,
  };

  useEffect(() => {
    const activeIndex = VAULT_SEGMENTS.indexOf(activeSegment);
    let leftOffset = 0;
    let width = 0;

    for (let i = 0; i < activeIndex; i++) {
      leftOffset += segmentWidthsRef.current[VAULT_SEGMENTS[i]];
    }

    width = segmentWidthsRef.current[activeSegment];

    Animated.spring(underlineLeftRef, {
      toValue: leftOffset,
      useNativeDriver: false,
      friction: 8,
      tension: 100,
    }).start();

    Animated.spring(underlineWidthRef, {
      toValue: width,
      useNativeDriver: false,
      friction: 8,
      tension: 100,
    }).start();
     
  }, [activeSegment, underlineLeftRef, underlineWidthRef]);

  const handleSegmentPress = (segment: VaultSegment) => {
    onSegmentChange(segment);
    Haptics.selectionAsync();
  };

  return (
    <View style={styles.segmentContainer}>
      <View style={styles.segmentRow}>
        {VAULT_SEGMENTS.map((seg) => {
          const isActive = activeSegment === seg;
          return (
            <Pressable
              key={seg}
              style={styles.segmentBtn}
              onPress={() => handleSegmentPress(seg)}
              onLayout={(e) => {
                segmentWidthsRef.current[seg] = e.nativeEvent.layout.width;
              }}
            >
              <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                {labels[seg]}
              </Text>
              <View style={styles.countBadgeContainer}>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{counts[seg]}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
        <Animated.View
          style={[
            styles.segmentUnderline,
            {
              left: underlineLeftRef,
              width: underlineWidthRef,
            },
          ]}
        />
      </View>
    </View>
  );
}

const INBOX_PRIORITY_COLORS: Record<string, string> = {
  urgent: C.primary,
  high: C.amber,
  medium: C.accent,
  low: C.textSecondary,
};

const InboxItemCard = React.memo(function InboxItemCard({
  item,
  onConvertToTask,
  onSaveAsMemory,
  onAddToCalendar,
  onDismiss,
  onDelete,
}: {
  item: InboxItem;
  onConvertToTask: () => void;
  onSaveAsMemory: () => void;
  onAddToCalendar: () => void;
  onDismiss: () => void;
  onDelete: () => void;
}) {
  const catIcon = getCategoryIcon(item.parsedCategory || 'task');
  const catColor = getCategoryColor(item.parsedCategory || 'task', C);
  const priColor = INBOX_PRIORITY_COLORS[item.parsedPriority || 'medium'] || C.textSecondary;
  const isProcessed = item.status === 'processed';
  const isDismissed = item.status === 'dismissed';

  return (
    <View style={[
      inboxStyles.itemCard,
      isProcessed && inboxStyles.itemCardProcessed,
      isDismissed && inboxStyles.itemCardDismissed,
    ]}>
      <View style={inboxStyles.itemTop}>
        <View style={[inboxStyles.itemIconBg, { backgroundColor: catColor + '18' }]}>
          <Ionicons name={catIcon as any} size={18} color={catColor} />
        </View>
        <View style={inboxStyles.itemContent}>
          <Text style={[
            inboxStyles.itemTitle,
            (isProcessed || isDismissed) && inboxStyles.itemTitleFaded,
          ]} numberOfLines={2}>
            {item.parsedTitle || item.rawText}
          </Text>
          <View style={inboxStyles.itemMeta}>
            <View style={[inboxStyles.catPill, { backgroundColor: catColor + '18' }]}>
              <Text style={[inboxStyles.catPillText, { color: catColor }]}>
                {item.parsedCategory || 'task'}
              </Text>
            </View>
            {item.parsedPriority && item.parsedPriority !== 'medium' && (
              <View style={[inboxStyles.priPill, { backgroundColor: priColor + '18' }]}>
                <View style={[inboxStyles.priDot, { backgroundColor: priColor }]} />
                <Text style={[inboxStyles.priText, { color: priColor }]}>
                  {getPriorityLabel(item.parsedPriority)}
                </Text>
              </View>
            )}
            {item.parsedDueDate && (
              <View style={inboxStyles.datePill}>
                <Ionicons name="time-outline" size={10} color={C.accent} />
                <Text style={inboxStyles.dateText}>
                  {formatParsedDate(item.parsedDueDate)}
                </Text>
              </View>
            )}
            {isProcessed && (
              <View style={[inboxStyles.statusPill, { backgroundColor: C.success + '18' }]}>
                <Ionicons name="checkmark-circle" size={10} color={C.success} />
                <Text style={[inboxStyles.statusText, { color: C.success }]}>Processed</Text>
              </View>
            )}
            {isDismissed && (
              <View style={[inboxStyles.statusPill, { backgroundColor: C.textTertiary + '18' }]}>
                <Ionicons name="close-circle" size={10} color={C.textTertiary} />
                <Text style={[inboxStyles.statusText, { color: C.textTertiary }]}>Dismissed</Text>
              </View>
            )}
          </View>
        </View>
        {!isProcessed && !isDismissed && (
          <Pressable onPress={onDelete} hitSlop={8} style={inboxStyles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={C.textTertiary} />
          </Pressable>
        )}
      </View>
      {!isProcessed && !isDismissed && (
        <View style={inboxStyles.actionsRow}>
          <Pressable style={inboxStyles.actionBtn} onPress={onConvertToTask}>
            <Ionicons name="checkmark-circle-outline" size={15} color={C.amber} />
            <Text style={[inboxStyles.actionText, { color: C.amber }]}>Task</Text>
          </Pressable>
          <Pressable style={inboxStyles.actionBtn} onPress={onSaveAsMemory}>
            <Ionicons name="document-text-outline" size={15} color={C.purple} />
            <Text style={[inboxStyles.actionText, { color: C.purple }]}>Memory</Text>
          </Pressable>
          <Pressable style={inboxStyles.actionBtn} onPress={onAddToCalendar}>
            <Ionicons name="calendar-outline" size={15} color={C.accent} />
            <Text style={[inboxStyles.actionText, { color: C.accent }]}>Calendar</Text>
          </Pressable>
          <Pressable style={inboxStyles.actionBtn} onPress={onDismiss}>
            <Ionicons name="close-circle-outline" size={15} color={C.textTertiary} />
            <Text style={[inboxStyles.actionText, { color: C.textTertiary }]}>Dismiss</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

function InboxSegment({
  inboxItems,
  onConvertToTask,
  onSaveAsMemory,
  onAddToCalendar,
  onDismiss,
  onDelete,
  onProcessAll,
  onClearInbox,
  bottomInset,
}: {
  inboxItems: InboxItem[];
  onConvertToTask: (item: InboxItem) => Promise<void>;
  onSaveAsMemory: (item: InboxItem) => Promise<void>;
  onAddToCalendar: (item: InboxItem) => Promise<void>;
  onDismiss: (item: InboxItem) => Promise<void>;
  onDelete: (item: InboxItem) => Promise<void>;
  onProcessAll: () => Promise<void>;
  onClearInbox: () => Promise<void>;
  bottomInset: number;
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'processed' | 'dismissed'>('pending');
  const [processing, setProcessing] = useState(false);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return inboxItems;
    if (filter === 'pending') {
      return inboxItems.filter(i => i.status === 'pending' || i.status === 'processing');
    }
    return inboxItems.filter(i => i.status === filter);
  }, [inboxItems, filter]);

  const pendingCount = inboxItems.filter(i => i.status === 'pending').length;

  const handleProcessAll = async () => {
    if (processing || pendingCount === 0) return;
    setProcessing(true);
    try {
      await onProcessAll();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={inboxStyles.subHeader}>
        {pendingCount > 0 && (
          <Pressable
            style={inboxStyles.processAllBtn}
            onPress={handleProcessAll}
            disabled={processing}
          >
            <Ionicons name={processing ? 'hourglass-outline' : 'flash'} size={14} color="#fff" />
            <Text style={inboxStyles.processAllText}>
              {processing ? 'Processing...' : `Process All (${pendingCount})`}
            </Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable
          style={inboxStyles.clearBtn}
          onPress={onClearInbox}
          disabled={inboxItems.length === 0}
        >
          <Ionicons name="trash-outline" size={14} color={inboxItems.length > 0 ? C.error : C.textTertiary} />
        </Pressable>
      </View>

      <View style={inboxStyles.filterRowWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={inboxStyles.filterRow}>
          {([
            { key: 'pending' as const, label: 'Pending' },
            { key: 'processed' as const, label: 'Processed' },
            { key: 'dismissed' as const, label: 'Dismissed' },
            { key: 'all' as const, label: 'All' },
          ]).map((f) => (
            <Pressable
              key={f.key}
              style={[inboxStyles.filterChip, filter === f.key && inboxStyles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[inboxStyles.filterChipText, filter === f.key && inboxStyles.filterChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InboxItemCard
            item={item}
            onConvertToTask={() => onConvertToTask(item)}
            onSaveAsMemory={() => onSaveAsMemory(item)}
            onAddToCalendar={() => onAddToCalendar(item)}
            onDismiss={() => onDismiss(item)}
            onDelete={() => onDelete(item)}
          />
        )}
        contentContainerStyle={[
          inboxStyles.listContent,
          { paddingBottom: bottomInset + 20 },
          filteredItems.length === 0 && { flex: 1, justifyContent: 'center' as const },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        scrollEnabled={!!filteredItems.length}
        ListEmptyComponent={
          <View style={inboxStyles.emptyState}>
            <View style={inboxStyles.emptyIconBg}>
              <Ionicons name="inbox-outline" size={40} color={C.text} />
            </View>
            <Text style={inboxStyles.emptyTitle}>
              {filter === 'pending' ? 'No pending items' : 'No items'}
            </Text>
            <Text style={inboxStyles.emptySubtitle}>
              Use the Brain Dump button to quickly capture thoughts and tasks
            </Text>
          </View>
        }
      />
    </View>
  );
}

const inboxStyles = StyleSheet.create({
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 4,
  },
  processAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.secondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  processAllText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#fff',
  },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRowWrapper: {
    height: 48,
    flexShrink: 0,
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center' as const,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  filterChipActive: {
    backgroundColor: C.primaryMuted,
    borderColor: C.primary,
  },
  filterChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: C.textSecondary,
  },
  filterChipTextActive: {
    color: C.primary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  itemCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 10,
  },
  itemCardProcessed: {
    opacity: 0.6,
  },
  itemCardDismissed: {
    opacity: 0.4,
  },
  itemTop: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  itemIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
    gap: 6,
  },
  itemTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  itemTitleFaded: {
    color: C.textTertiary,
    textDecorationLine: 'line-through' as const,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  catPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catPillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  priPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  priText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: C.accent + '12',
  },
  dateText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: C.accent,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  deleteBtn: {
    padding: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 4,
    paddingLeft: 46,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: C.cardElevated,
  },
  actionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 30,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primaryMuted,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
    marginTop: 6,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textTertiary,
    textAlign: 'center' as const,
    maxWidth: 280,
  },
});

export default function VaultScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { openTaskId, openMemoryId } = useLocalSearchParams<{ openTaskId?: string; openMemoryId?: string }>();
  const {
    tasks, createTask, updateTask, deleteTask,
    memoryEntries, updateMemoryEntry, createMemoryEntry, deleteMemoryEntry,
    gatewayStatus, gatewayMemoryFiles, fetchGatewayMemory,
    createCalendarEvent, deleteCalendarEvent,
    inboxItems, updateInboxItem, deleteInboxItem, clearInbox,
  } = useApp();

  useEffect(() => {
    inboxStorage.recoverStuckProcessing().catch((e) =>
      console.warn('[vault] Failed to recover stuck inbox items:', e),
    );
  }, []);

  const convertItemToTask = useCallback(async (item: InboxItem): Promise<void> => {
    await updateInboxItem(item.id, { status: 'processing' });
    let task;
    try {
      task = await createTask(
        item.parsedTitle || item.rawText,
        'todo',
        item.parsedPriority || 'medium',
        undefined,
        { source: 'braindump' },
      );
      if (item.parsedDueDate) {
        await updateTask(task.id, { dueDate: item.parsedDueDate });
      }
    } catch (e) {
      await updateInboxItem(item.id, { status: 'pending' });
      throw e;
    }
    try {
      await updateInboxItem(item.id, { status: 'processed' });
    } catch (e) {
      try { await deleteTask(task.id); } catch (rollbackErr) {
        console.warn('[vault] Rollback failed after task conversion error:', rollbackErr);
      }
      await updateInboxItem(item.id, { status: 'pending' }).catch((revertErr) =>
        console.warn('[vault] Failed to revert inbox item to pending:', revertErr),
      );
      throw e;
    }
  }, [createTask, updateTask, updateInboxItem, deleteTask]);

  const convertItemToEvent = useCallback(async (item: InboxItem): Promise<void> => {
    await updateInboxItem(item.id, { status: 'processing' });
    const startTime = item.parsedDueDate || Date.now() + 3600000;
    let event;
    try {
      event = await createCalendarEvent({
        title: item.parsedTitle || item.rawText,
        startTime,
        endTime: startTime + 3600000,
        source: 'manual',
      });
    } catch (e) {
      await updateInboxItem(item.id, { status: 'pending' });
      throw e;
    }
    try {
      await updateInboxItem(item.id, { status: 'processed' });
    } catch (e) {
      try { await deleteCalendarEvent(event.id); } catch (rollbackErr) {
        console.warn('[vault] Rollback failed after event conversion error:', rollbackErr);
      }
      await updateInboxItem(item.id, { status: 'pending' }).catch((revertErr) =>
        console.warn('[vault] Failed to revert inbox item to pending:', revertErr),
      );
      throw e;
    }
  }, [createCalendarEvent, deleteCalendarEvent, updateInboxItem]);

  const convertItemToMemory = useCallback(async (item: InboxItem): Promise<void> => {
    await updateInboxItem(item.id, { status: 'processing' });
    let entry;
    try {
      entry = await createMemoryEntry({
        type: 'note',
        title: item.parsedTitle || item.rawText,
        content: item.rawText,
        source: 'braindump',
        tags: ['from:braindump'],
        reviewStatus: 'unread',
      });
    } catch (e) {
      await updateInboxItem(item.id, { status: 'pending' });
      throw e;
    }
    try {
      await updateInboxItem(item.id, { status: 'processed' });
    } catch (e) {
      try { await deleteMemoryEntry(entry.id); } catch (rollbackErr) {
        console.warn('[vault] Rollback failed after memory conversion error:', rollbackErr);
      }
      await updateInboxItem(item.id, { status: 'pending' }).catch((revertErr) =>
        console.warn('[vault] Failed to revert inbox item to pending:', revertErr),
      );
      throw e;
    }
  }, [createMemoryEntry, deleteMemoryEntry, updateInboxItem]);

  const [activeSegment, setActiveSegment] = useState<VaultSegment>('tasks');

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [taskSortMode, setTaskSortMode] = useState<TaskSortMode>('priority');
  const [showTaskSortModal, setShowTaskSortModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [moveTask, setMoveTask] = useState<Task | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('medium');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('todo');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskTags, setNewTaskTags] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');

  const [memSearch, setMemSearch] = useState('');
  const [memFilter, setMemFilter] = useState<FilterType>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [showTagBrowser, setShowTagBrowser] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [memSortOption, setMemSortOption] = useState<MemorySortOption>('newest');
  const [showMemSortModal, setShowMemSortModal] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<MemoryEntry | null>(null);
  const [showMemDetailModal, setShowMemDetailModal] = useState(false);
  const [showCreateMemModal, setShowCreateMemModal] = useState(false);
  const [newMemTitle, setNewMemTitle] = useState('');
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemTags, setNewMemTags] = useState('');
  const [newMemType, setNewMemType] = useState<MemoryEntry['type']>('note');

  const [syncingMemory, setSyncingMemory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mindMaps, setMindMaps] = useState<MindMap[]>([]);

  useEffect(() => {
    getAllMindMaps().then(setMindMaps).catch((e) => console.warn('[vault] Failed to load mind maps:', e));
  }, []);

  const refreshMindMaps = useCallback(() => {
    getAllMindMaps().then(setMindMaps).catch((e) => console.warn('[vault] Failed to refresh mind maps:', e));
  }, []);

  const handledDeepLink = useRef<string | null>(null);
  useEffect(() => {
    const key = openTaskId || openMemoryId || null;
    if (!key || handledDeepLink.current === key) return;
    if (openTaskId) {
      const task = tasks.find(t => t.id === openTaskId);
      if (task) {
        handledDeepLink.current = key;
        setActiveSegment('tasks');
        setDetailTask(task);
        setShowTaskDetailModal(true);
      }
    } else if (openMemoryId) {
      const mem = memoryEntries.find(m => m.id === openMemoryId);
      if (mem) {
        handledDeepLink.current = key;
        setActiveSegment('knowledge');
        setSelectedMemory(mem);
        setShowMemDetailModal(true);
      }
    }
  }, [openTaskId, openMemoryId, tasks, memoryEntries]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshMindMaps();
    setTimeout(() => setRefreshing(false), 500);
  }, [refreshMindMaps]);

  const handleSyncMemory = useCallback(async () => {
    setSyncingMemory(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await fetchGatewayMemory();
    } catch (e) {
      console.warn('[vault] Failed to sync memory from gateway:', e);
      showToast('error', 'Failed to sync memory');
    }
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

  const filteredTasks = useMemo(() => {
    let items = [...tasks];
    if (statusFilter !== 'all') {
      items = items.filter((t) => t.status === statusFilter);
    }
    if (taskSearchQuery.trim()) {
      const q = taskSearchQuery.toLowerCase();
      items = items.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    switch (taskSortMode) {
      case 'priority': {
        const pOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        items.sort((a, b) => pOrder[a.priority] - pOrder[b.priority] || b.updatedAt - a.updatedAt);
        break;
      }
      case 'dueDate':
        items.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate - b.dueDate;
        });
        break;
      case 'newest':
        items.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'alphabetical':
        items.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return items;
  }, [tasks, statusFilter, taskSearchQuery, taskSortMode]);

  const filteredEntries = useMemo(() => {
    let entries = [...memoryEntries];
    if (memFilter !== 'all') {
      entries = entries.filter((e) => e.type === memFilter);
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
    if (memSearch.trim()) {
      const q = memSearch.toLowerCase();
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
      switch (memSortOption) {
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
  }, [memoryEntries, memFilter, reviewFilter, selectedTag, memSearch, memSortOption]);

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

  const handleTaskStatusChange = useCallback(
    (id: string, status: TaskStatus) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateTask(id, { status });
    },
    [updateTask],
  );

  const handleTaskDelete = useCallback(
    (task: Task) => {
      if (Platform.OS === 'web') {
        deleteTask(task.id);
        return;
      }
      Alert.alert('Delete Task', `Remove "${task.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTask(task.id) },
      ]);
    },
    [deleteTask],
  );

  const handleAddTask = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await createTask(newTaskTitle.trim(), newTaskStatus, newTaskPriority, newTaskDesc.trim() || undefined);

    const dueTs = parseDueDateInput(newTaskDueDate);
    const tagsList = newTaskTags.trim()
      ? newTaskTags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;
    const assigneeVal = newTaskAssignee.trim() || undefined;

    if (dueTs || tagsList || assigneeVal) {
      const allTasks = tasks;
      const latestTask = allTasks[allTasks.length - 1];
      if (latestTask) {
        setTimeout(async () => {
          const currentTasks = tasks;
          const newest = currentTasks.length > 0 ? currentTasks[currentTasks.length - 1] : null;
          if (newest) {
            await updateTask(newest.id, {
              ...(dueTs ? { dueDate: dueTs } : {}),
              ...(tagsList ? { tags: tagsList } : {}),
              ...(assigneeVal ? { assignee: assigneeVal } : {}),
            });
          }
        }, 300);
      }
    }

    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskPriority('medium');
    setNewTaskStatus('todo');
    setNewTaskDueDate('');
    setNewTaskTags('');
    setNewTaskAssignee('');
    setShowAddTaskModal(false);
  }, [newTaskTitle, newTaskDesc, newTaskPriority, newTaskStatus, newTaskDueDate, newTaskTags, newTaskAssignee, createTask, tasks, updateTask]);

  const handleMoveTask = useCallback((task: Task) => {
    setMoveTask(task);
    setShowMoveModal(true);
  }, []);

  const handleOpenTaskDetail = useCallback((task: Task) => {
    setDetailTask(task);
    setShowTaskDetailModal(true);
  }, []);

  const handleTaskDetailSave = useCallback((id: string, updates: Partial<Task>) => {
    updateTask(id, updates);
  }, [updateTask]);

  const handleMemPin = useCallback((id: string, currentPinned?: boolean) => {
    updateMemoryEntry(id, { pinned: !currentPinned });
  }, [updateMemoryEntry]);

  const handleMemReview = useCallback((id: string) => {
    updateMemoryEntry(id, { reviewStatus: 'reviewed' });
  }, [updateMemoryEntry]);

  const handleMemDefer = useCallback((id: string, currentStatus?: string) => {
    updateMemoryEntry(id, { reviewStatus: currentStatus === 'deferred' ? 'unread' : 'deferred' });
  }, [updateMemoryEntry]);

  const openMemDetail = useCallback((entry: MemoryEntry) => {
    setSelectedMemory(entry);
    setShowMemDetailModal(true);
    Haptics.selectionAsync();
  }, []);

  const currentSelectedMemory = useMemo(() => {
    if (!selectedMemory) return null;
    return memoryEntries.find((e) => e.id === selectedMemory.id) || selectedMemory;
  }, [selectedMemory, memoryEntries]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={C.gradient.ocean} style={styles.headerGradient}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Workspace</Text>
          <Pressable onPress={() => { }}>
            <Ionicons name="settings-outline" size={22} color={C.textSecondary} />
          </Pressable>
        </View>
      </LinearGradient>

      <AnimatedSegmentSwitcher
        activeSegment={activeSegment}
        onSegmentChange={setActiveSegment}
        tasks={tasks}
        memoryEntries={memoryEntries}
        gatewayMemoryFiles={gatewayMemoryFiles}
        inboxCount={inboxItems.filter(i => i.status === 'pending').length}
      />

      {activeSegment === 'inbox' && (
        <InboxSegment
          inboxItems={inboxItems}
          onConvertToTask={async (item) => {
            try {
              await convertItemToTask(item);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast('success', 'Task created');
            } catch (e) {
              console.warn('[vault] Task conversion failed:', e);
              showToast('error', `Failed to create task: ${e instanceof Error ? e.message : 'unknown error'}`);
            }
          }}
          onSaveAsMemory={async (item) => {
            try {
              await convertItemToMemory(item);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast('success', 'Saved as memory');
            } catch (e) {
              console.warn('[vault] Memory conversion failed:', e);
              showToast('error', `Failed to save memory: ${e instanceof Error ? e.message : 'unknown error'}`);
            }
          }}
          onAddToCalendar={async (item) => {
            try {
              await convertItemToEvent(item);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast('success', 'Event added');
            } catch (e) {
              console.warn('[vault] Event conversion failed:', e);
              showToast('error', `Failed to add event: ${e instanceof Error ? e.message : 'unknown error'}`);
            }
          }}
          onDismiss={async (item) => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await updateInboxItem(item.id, { status: 'dismissed' });
            } catch (e) {
              console.warn('[vault] Dismiss failed:', e);
              showToast('error', `Failed to dismiss: ${e instanceof Error ? e.message : 'unknown error'}`);
            }
          }}
          onDelete={async (item) => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await deleteInboxItem(item.id);
            } catch (e) {
              console.warn('[vault] Delete failed:', e);
              showToast('error', `Failed to delete: ${e instanceof Error ? e.message : 'unknown error'}`);
            }
          }}
          onProcessAll={async () => {
            const pending = inboxItems.filter(i => i.status === 'pending');
            let succeeded = 0;
            const failures: string[] = [];
            for (const item of pending) {
              try {
                const category = item.parsedCategory || 'task';
                if (category === 'task') {
                  await convertItemToTask(item);
                } else if (category === 'event') {
                  await convertItemToEvent(item);
                } else {
                  await convertItemToMemory(item);
                }
                succeeded++;
              } catch (e) {
                const label = item.parsedTitle || item.rawText.slice(0, 30);
                console.warn(`[vault] Process All: failed to convert "${label}":`, e);
                failures.push(label);
              }
            }
            const allOk = succeeded === pending.length;
            Haptics.notificationAsync(allOk
              ? Haptics.NotificationFeedbackType.Success
              : Haptics.NotificationFeedbackType.Warning);
            showToast(
              allOk ? 'success' : 'error',
              allOk
                ? `Processed all ${pending.length} items`
                : `${succeeded} processed, ${failures.length} failed`,
            );
          }}
          onClearInbox={async () => {
            if (Platform.OS === 'web') {
              await clearInbox();
              return;
            }
            Alert.alert('Clear Inbox', 'Remove all inbox items?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear All', style: 'destructive', onPress: () => clearInbox() },
            ]);
          }}
          bottomInset={insets.bottom}
        />
      )}

      {activeSegment === 'tasks' && (
        <View style={{ flex: 1 }}>
          <View style={styles.taskSubHeader}>
            <View style={styles.viewToggle}>
              <Pressable
                style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
                onPress={() => setViewMode('list')}
              >
                <Ionicons name="list" size={18} color={viewMode === 'list' ? C.text : C.textTertiary} />
              </Pressable>
              <Pressable
                style={[styles.viewBtn, viewMode === 'board' && styles.viewBtnActive]}
                onPress={() => setViewMode('board')}
              >
                <Ionicons name="grid-outline" size={16} color={viewMode === 'board' ? C.text : C.textTertiary} />
              </Pressable>
            </View>
            <Pressable onPress={() => setShowTaskSortModal(true)}>
              <Ionicons name="swap-vertical-outline" size={22} color={C.textSecondary} />
            </Pressable>
            <Pressable
              testID="add-task-btn"
              onPress={() => setShowAddTaskModal(true)}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <LinearGradient colors={C.gradient.lobster} style={styles.addBtnGrad}>
                <Ionicons name="add" size={22} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>

          <StatsBar tasks={tasks} />

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={C.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search tasks..."
              placeholderTextColor={C.textTertiary}
              value={taskSearchQuery}
              onChangeText={setTaskSearchQuery}
            />
            {taskSearchQuery.length > 0 && (
              <Pressable onPress={() => setTaskSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={C.textTertiary} />
              </Pressable>
            )}
          </View>

          {(() => {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const overdueCount = tasks.filter(t => t.dueDate && t.dueDate < now.getTime() && t.status !== 'done' && t.status !== 'archived').length;
            if (overdueCount === 0) return null;
            return (
              <View style={styles.overdueBanner}>
                <Ionicons name="warning" size={16} color={C.amber} />
                <Text style={styles.overdueBannerText}>
                  {overdueCount} overdue task{overdueCount > 1 ? 's' : ''} need{overdueCount === 1 ? 's' : ''} attention
                </Text>
              </View>
            );
          })()}

          {viewMode === 'list' && (
            <View style={{ flex: 1 }}>
              <View style={styles.filterRowWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {([
                    { key: 'all', label: 'All' },
                    { key: 'todo', label: 'To Do' },
                    { key: 'in_progress', label: 'Active' },
                    { key: 'done', label: 'Done' },
                    { key: 'deferred', label: 'Deferred' },
                    { key: 'archived', label: 'Archived' },
                  ] as const).map((f) => (
                    <Pressable
                      key={f.key}
                      style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                      onPress={() => setStatusFilter(f.key)}
                    >
                      <Text
                        style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}
                      >
                        {f.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <FlatList
                data={filteredTasks}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <SwipeableTaskCard
                    task={item}
                    onPress={() => handleOpenTaskDetail(item)}
                    onLongPress={() => handleMoveTask(item)}
                    onStatusChange={handleTaskStatusChange}
                    onDelete={handleTaskDelete}
                  />
                )}
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: insets.bottom + 20 },
                  filteredTasks.length === 0 && styles.emptyContainer,
                ]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.coral} colors={[C.coral]} />}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                scrollEnabled={!!filteredTasks.length}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconBg}>
                      <Ionicons name="checkbox-outline" size={40} color={C.text} />
                    </View>
                    <Text style={styles.emptyTitle}>No tasks yet</Text>
                    <Text style={styles.emptySubtitle}>Create your first task or connect a gateway to sync</Text>
                  </View>
                }
              />
            </View>
          )}

          {viewMode === 'board' && (
            <View style={styles.boardContainer}>
              <FlatList
                data={KANBAN_COLUMNS}
                horizontal
                keyExtractor={(item) => item.status}
                renderItem={({ item }) => (
                  <BoardColumn
                    title={item.label}
                    tasks={tasks.filter((t) => t.status === item.status).sort((a, b) => b.updatedAt - a.updatedAt)}
                    color={item.color}
                    onMove={handleMoveTask}
                    onDelete={handleTaskDelete}
                  />
                )}
                contentContainerStyle={styles.boardScroll}
                showsHorizontalScrollIndicator={false}
                snapToAlignment="start"
                decelerationRate="fast"
              />
            </View>
          )}

          <MoveToModal
            visible={showMoveModal}
            task={moveTask}
            onClose={() => { setShowMoveModal(false); setMoveTask(null); }}
            onMove={handleTaskStatusChange}
          />

          <TaskDetailModal
            visible={showTaskDetailModal}
            task={detailTask}
            onClose={() => { setShowTaskDetailModal(false); setDetailTask(null); }}
            onSave={handleTaskDetailSave}
            onDelete={handleTaskDelete}
          />

          <Modal visible={showTaskSortModal} transparent animationType="fade" onRequestClose={() => setShowTaskSortModal(false)}>
            <Pressable style={styles.sortOverlay} onPress={() => setShowTaskSortModal(false)}>
              <View style={styles.sortSheet}>
                <Text style={styles.sortTitle}>Sort By</Text>
                {TASK_SORT_OPTIONS.map((opt) => {
                  const isActive = taskSortMode === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[styles.sortOption, isActive && styles.sortOptionActive]}
                      onPress={() => {
                        setTaskSortMode(opt.key);
                        setShowTaskSortModal(false);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Ionicons name={opt.icon as any} size={18} color={isActive ? C.primary : C.textSecondary} />
                      <Text style={[styles.sortOptionText, isActive && { color: C.primary }]}>{opt.label}</Text>
                      {isActive && <Ionicons name="checkmark" size={16} color={C.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={showAddTaskModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowAddTaskModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>New Task</Text>
                  <Pressable onPress={() => setShowAddTaskModal(false)}>
                    <Ionicons name="close" size={24} color={C.textSecondary} />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
                  <TextInput
                    style={styles.input}
                    placeholder="Task title"
                    placeholderTextColor={C.textTertiary}
                    value={newTaskTitle}
                    onChangeText={setNewTaskTitle}
                    autoFocus
                  />
                  <TextInput
                    style={[styles.input, { height: 80 }]}
                    placeholder="Description (optional)"
                    placeholderTextColor={C.textTertiary}
                    value={newTaskDesc}
                    onChangeText={setNewTaskDesc}
                    multiline
                    textAlignVertical="top"
                  />

                  <Text style={styles.priorityLabel}>Priority</Text>
                  <View style={styles.priorityRow}>
                    {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                      const pConfig = PRIORITY_CONFIG[p];
                      const selected = newTaskPriority === p;
                      return (
                        <Pressable
                          key={p}
                          style={[
                            styles.priorityBtn,
                            selected && { backgroundColor: pConfig.color + '20', borderColor: pConfig.color },
                          ]}
                          onPress={() => setNewTaskPriority(p)}
                        >
                          <Text
                            style={[
                              styles.priorityBtnText,
                              selected && { color: pConfig.color },
                            ]}
                          >
                            {pConfig.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.priorityLabel}>Column</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {KANBAN_COLUMNS.map((col) => {
                      const selected = newTaskStatus === col.status;
                      return (
                        <Pressable
                          key={col.status}
                          style={[styles.statusBtn, selected && { backgroundColor: col.color + '20', borderColor: col.color }]}
                          onPress={() => setNewTaskStatus(col.status)}
                        >
                          <View style={[styles.statusBtnDot, { backgroundColor: col.color }]} />
                          <Text style={[styles.statusBtnText, selected && { color: col.color }]}>{col.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <Text style={styles.priorityLabel}>Due Date (optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder='e.g. "Feb 22" or "2/22"'
                    placeholderTextColor={C.textTertiary}
                    value={newTaskDueDate}
                    onChangeText={setNewTaskDueDate}
                  />

                  <Text style={styles.priorityLabel}>Tags (comma separated, optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder='e.g. "design, frontend, urgent"'
                    placeholderTextColor={C.textTertiary}
                    value={newTaskTags}
                    onChangeText={setNewTaskTags}
                  />

                  <Text style={styles.priorityLabel}>Assignee (optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. John Doe"
                    placeholderTextColor={C.textTertiary}
                    value={newTaskAssignee}
                    onChangeText={setNewTaskAssignee}
                  />

                  <Pressable
                    onPress={handleAddTask}
                    style={({ pressed }) => [
                      !newTaskTitle.trim() && { opacity: 0.4 },
                      pressed && { opacity: 0.8 },
                    ]}
                    disabled={!newTaskTitle.trim()}
                  >
                    <LinearGradient colors={C.gradient.lobster} style={styles.saveBtn}>
                      <Text style={styles.saveBtnText}>Create Task</Text>
                    </LinearGradient>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      )}

      {activeSegment === 'knowledge' && (
        <View style={{ flex: 1 }}>
          <View style={styles.knowledgeSubHeader}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{memoryEntries.length}</Text>
            </View>
            <Pressable
              style={styles.headerBtn}
              onPress={() => {
                setShowMemSortModal(true);
                Haptics.selectionAsync();
              }}
            >
              <Ionicons name="swap-vertical-outline" size={18} color={memSortOption !== 'newest' ? C.coral : C.textSecondary} />
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
                setShowCreateMemModal(true);
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

          {mindMaps.length > 0 && (
            <View style={styles.mindMapsSection}>
              <View style={styles.mindMapsSectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="git-network-outline" size={16} color={C.accent} />
                  <Text style={styles.mindMapsSectionTitle}>Mind Maps</Text>
                </View>
                <Pressable
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    const map = await createMindMap('Untitled Mind Map');
                    refreshMindMaps();
                    router.push({ pathname: '/mindmap', params: { id: map.id } } as any);
                  }}
                >
                  <Ionicons name="add" size={20} color={C.textSecondary} />
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
                {mindMaps.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10).map((map) => (
                  <Pressable
                    key={map.id}
                    style={styles.mindMapCard}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({ pathname: '/mindmap', params: { id: map.id } } as any);
                    }}
                    onLongPress={() => {
                      if (Platform.OS === 'web') {
                        if (confirm(`Delete "${map.title}"?`)) {
                          deleteMindMap(map.id).then(refreshMindMaps);
                        }
                      } else {
                        Alert.alert('Delete Mind Map', `Delete "${map.title}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteMindMap(map.id).then(refreshMindMaps) },
                        ]);
                      }
                    }}
                  >
                    <Ionicons name="git-network-outline" size={20} color={C.accent} />
                    <Text style={styles.mindMapCardTitle} numberOfLines={1}>{map.title}</Text>
                    <View style={styles.mindMapCardMeta}>
                      <Text style={styles.mindMapCardMetaText}>{map.nodes.length} nodes</Text>
                      <Text style={styles.mindMapCardMetaText}>{formatAge(map.updatedAt)}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {deferredCount > 0 && reviewFilter !== 'deferred' && (
            <Pressable
              style={styles.deferredBanner}
              onPress={() => {
                setReviewFilter('deferred');
                Haptics.selectionAsync();
              }}
            >
              <LinearGradient
                colors={['#1A1530', '#151028']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.deferredBannerGrad}
              >
                <Ionicons name="time" size={18} color="#8B7FFF" />
                <Text style={styles.deferredBannerText}>
                  {deferredCount} deferred note{deferredCount !== 1 ? 's' : ''} to review
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#8B7FFF" />
              </LinearGradient>
            </Pressable>
          )}

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={C.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search memories, tags, content..."
              placeholderTextColor={C.textTertiary}
              value={memSearch}
              onChangeText={setMemSearch}
            />
            {memSearch.length > 0 && (
              <Pressable onPress={() => setMemSearch('')}>
                <Ionicons name="close-circle" size={18} color={C.textTertiary} />
              </Pressable>
            )}
          </View>

          {memoryEntries.length > 0 && (
            <View style={[styles.digestCard, C.shadow.elevated as any]}>
              <LinearGradient
                colors={C.gradient.cardElevated}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
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
              </LinearGradient>
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

          <View style={styles.filterRowWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memFilterRow}>
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
                  style={[styles.filterChip, memFilter === f.key && styles.filterChipActive]}
                  onPress={() => setMemFilter(f.key)}
                >
                  <Text style={[styles.filterChipText, memFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

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
                  onPin={() => handleMemPin(item.entry.id, item.entry.pinned)}
                  onReview={() => handleMemReview(item.entry.id)}
                  onDefer={() => handleMemDefer(item.entry.id, item.entry.reviewStatus)}
                  onPress={() => openMemDetail(item.entry)}
                />
              );
            }}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 20 },
              flatData.length === 0 && styles.emptyContainer,
            ]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.coral} colors={[C.coral]} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {!memSearch && !selectedTag ? (
                  <>
                    <View style={[styles.emptyIconBg, { backgroundColor: C.accent + '15' }]}>
                      <MaterialCommunityIcons name="brain" size={40} color={C.accent} />
                    </View>
                    <Text style={styles.emptyTitle}>Knowledge base empty</Text>
                    <Text style={styles.emptySubtitle}>Connect your gateway to sync knowledge, or add entries manually</Text>
                  </>
                ) : (
                  <>
                    <View style={[styles.emptyIconBg, { backgroundColor: C.textTertiary + '12' }]}>
                      <Ionicons name="search-outline" size={40} color={C.textTertiary} />
                    </View>
                    <Text style={styles.emptyTitle}>
                      {memSearch ? 'No results found' : `No memories tagged "${selectedTag}"`}
                    </Text>
                    <Text style={styles.emptySubtitle}>
                      {memSearch ? 'Try a different search term' : 'Try a different tag'}
                    </Text>
                  </>
                )}
              </View>
            }
          />

          <Modal
            visible={showMemSortModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowMemSortModal(false)}
          >
            <Pressable style={styles.memSortOverlay} onPress={() => setShowMemSortModal(false)}>
              <View style={styles.memSortModal}>
                <Text style={styles.memSortModalTitle}>Sort By</Text>
                {MEMORY_SORT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[styles.memSortOption, memSortOption === opt.key && styles.memSortOptionActive]}
                    onPress={() => {
                      setMemSortOption(opt.key);
                      setShowMemSortModal(false);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Ionicons name={opt.icon as any} size={16} color={memSortOption === opt.key ? C.coral : C.textSecondary} />
                    <Text style={[styles.memSortOptionText, memSortOption === opt.key && styles.memSortOptionTextActive]}>{opt.label}</Text>
                    {memSortOption === opt.key && <Ionicons name="checkmark" size={16} color={C.coral} />}
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Modal>

          <MemoryDetailModal
            item={currentSelectedMemory}
            visible={showMemDetailModal}
            onClose={() => setShowMemDetailModal(false)}
            onPin={() => {
              if (currentSelectedMemory) handleMemPin(currentSelectedMemory.id, currentSelectedMemory.pinned);
            }}
            onReview={() => {
              if (currentSelectedMemory) handleMemReview(currentSelectedMemory.id);
            }}
            onDefer={() => {
              if (currentSelectedMemory) handleMemDefer(currentSelectedMemory.id, currentSelectedMemory.reviewStatus);
            }}
            onDelete={() => {
              if (!currentSelectedMemory) return;
              const doDelete = () => {
                deleteMemoryEntry(currentSelectedMemory.id);
                setShowMemDetailModal(false);
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
            visible={showCreateMemModal}
            animationType="slide"
            transparent
            onRequestClose={() => setShowCreateMemModal(false)}
          >
            <View style={memModalStyles.overlay}>
              <View style={memModalStyles.container}>
                <View style={memModalStyles.handle} />
                <ScrollView style={memModalStyles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={createStyles.headerRow}>
                    <Text style={memModalStyles.title}>New Memory Entry</Text>
                    <Pressable onPress={() => setShowCreateMemModal(false)}>
                      <Ionicons name="close" size={22} color={C.textSecondary} />
                    </Pressable>
                  </View>

                  <Text style={createStyles.label}>Title</Text>
                  <TextInput
                    style={createStyles.input}
                    placeholder="Entry title..."
                    placeholderTextColor={C.textTertiary}
                    value={newMemTitle}
                    onChangeText={setNewMemTitle}
                  />

                  <Text style={createStyles.label}>Content</Text>
                  <TextInput
                    style={[createStyles.input, createStyles.inputMultiline]}
                    placeholder="Write your note, thought, or content..."
                    placeholderTextColor={C.textTertiary}
                    value={newMemContent}
                    onChangeText={setNewMemContent}
                    multiline
                    textAlignVertical="top"
                  />

                  <Text style={createStyles.label}>Tags</Text>
                  <TextInput
                    style={createStyles.input}
                    placeholder="strategy, design, notes"
                    placeholderTextColor={C.textTertiary}
                    value={newMemTags}
                    onChangeText={setNewMemTags}
                  />

                  <Text style={createStyles.label}>Type</Text>
                  <View style={createStyles.typeRow}>
                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                      <Pressable
                        key={key}
                        style={[
                          createStyles.typePill,
                          newMemType === key && { backgroundColor: cfg.color + '25', borderColor: cfg.color + '50' },
                        ]}
                        onPress={() => setNewMemType(key as MemoryEntry['type'])}
                      >
                        <Ionicons name={cfg.icon as any} size={14} color={newMemType === key ? cfg.color : C.textTertiary} />
                        <Text style={[createStyles.typePillText, newMemType === key && { color: cfg.color }]}>{cfg.label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Pressable
                    onPress={async () => {
                      if (!newMemTitle.trim() || !newMemContent.trim()) return;
                      const parsedTags = newMemTags
                        .split(',')
                        .map((t) => t.trim())
                        .filter((t) => t.length > 0);
                      await createMemoryEntry({
                        title: newMemTitle.trim(),
                        content: newMemContent.trim(),
                        type: newMemType,
                        tags: parsedTags.length > 0 ? parsedTags : undefined,
                        source: 'manual',
                        reviewStatus: 'unread',
                      });
                      setNewMemTitle('');
                      setNewMemContent('');
                      setNewMemTags('');
                      setNewMemType('note');
                      setShowCreateMemModal(false);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                  >
                    <LinearGradient
                      colors={C.gradient.lobster}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[createStyles.createBtn, (!newMemTitle.trim() || !newMemContent.trim()) && { opacity: 0.5 }]}
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
      )}

      {activeSegment === 'files' && (
        <View style={{ flex: 1 }}>
          <View style={styles.filesSubHeader}>
            {gatewayStatus === 'connected' && (
              <Pressable
                style={styles.syncFilesBtn}
                onPress={handleSyncMemory}
                disabled={syncingMemory}
              >
                <Ionicons name={syncingMemory ? 'sync' : 'cloud-download-outline'} size={16} color={C.secondary} />
                <Text style={styles.syncFilesBtnText}>
                  {syncingMemory ? 'Syncing...' : 'Sync from Gateway'}
                </Text>
              </Pressable>
            )}
          </View>

          {gatewayMemoryFiles.length > 0 ? (
            <ScrollView contentContainerStyle={[styles.filesListContent, { paddingBottom: insets.bottom + 20 }]}>
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
                    setShowMemDetailModal(true);
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
            </ScrollView>
          ) : (
            <View style={styles.filesEmptyState}>
              <View style={[styles.emptyIconBg, { backgroundColor: C.secondary + '15' }]}>
                <Ionicons name="folder-open-outline" size={40} color={C.secondary} />
              </View>
              <Text style={styles.emptyTitle}>No files synced</Text>
              <Text style={styles.emptySubtitle}>Connect to your OpenClaw gateway to browse agent files</Text>
            </View>
          )}

          <MemoryDetailModal
            item={currentSelectedMemory}
            visible={showMemDetailModal && activeSegment === 'files'}
            onClose={() => setShowMemDetailModal(false)}
            onPin={() => {
              if (currentSelectedMemory) handleMemPin(currentSelectedMemory.id, currentSelectedMemory.pinned);
            }}
            onReview={() => {
              if (currentSelectedMemory) handleMemReview(currentSelectedMemory.id);
            }}
            onDefer={() => {
              if (currentSelectedMemory) handleMemDefer(currentSelectedMemory.id, currentSelectedMemory.reviewStatus);
            }}
            onDelete={() => {
              if (!currentSelectedMemory) return;
              deleteMemoryEntry(currentSelectedMemory.id);
              setShowMemDetailModal(false);
              setSelectedMemory(null);
            }}
          />
        </View>
      )}
    </View>
  );
}

const memModalStyles = StyleSheet.create({
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
  memTimestampText: {
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
  newMemActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: C.cardElevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
  },
  input: {
    backgroundColor: C.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  statusBtnDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#fff' },
});

const styles = StyleSheet.create({
  headerGradient: { paddingBottom: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: C.text },
  segmentContainer: { marginHorizontal: 20, marginVertical: 8 },
  segmentRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.borderLight, position: 'relative' as const },
  segmentBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', position: 'relative' as const },
  segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.textTertiary },
  segmentTextActive: { color: C.text },
  countBadgeContainer: { marginTop: 4 },
  countBadge: { backgroundColor: C.primaryMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, minWidth: 20, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.primary },
  segmentUnderline: { position: 'absolute' as const, bottom: -1, height: 3, backgroundColor: C.coral, borderRadius: 1.5 },
  taskSubHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20, gap: 12, marginBottom: 6 },
  knowledgeSubHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20, gap: 8, marginBottom: 6 },
  viewToggle: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' },
  viewBtn: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  viewBtnActive: { backgroundColor: C.cardElevated },
  addBtnGrad: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  statsBar: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.borderLight, gap: 10 },
  statsItems: { flexDirection: 'row', justifyContent: 'space-around' },
  statsItem: { alignItems: 'center' },
  statsNum: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  statsLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary, marginTop: 2 },
  progressTrack: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: C.border },
  progressSeg: { height: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: C.text,
    padding: 0,
  },
  filterRowWrapper: { height: 52, flexShrink: 0 },
  filterRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8, alignItems: 'center' as const },
  filterChip: { height: 32, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight, justifyContent: 'center' as const, alignItems: 'center' as const },
  filterChipActive: { backgroundColor: C.primaryMuted, borderColor: C.primary },
  filterChipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary },
  filterChipTextActive: { color: C.primary },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  taskCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 10,
    ...C.shadow.card,
  },
  taskCardTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  statusIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCardContent: { flex: 1 },
  taskTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text, lineHeight: 20 },
  taskTitleDone: { textDecorationLine: 'line-through', color: C.textTertiary },
  taskTitleArchived: { color: C.textTertiary },
  taskDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, marginTop: 3 },
  taskCardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 44 },
  priorityPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4 },
  priorityDot: { width: 5, height: 5, borderRadius: 3 },
  priorityText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  tagPill: { backgroundColor: C.accentMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.textSecondary },
  sourcePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  sourceText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.textSecondary },
  taskAge: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary, marginLeft: 'auto' as const },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 44 },
  dueDatePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dueDateText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textSecondary },
  assigneePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  assigneeAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.accent + '30', alignItems: 'center', justifyContent: 'center' },
  assigneeInitials: { fontFamily: 'Inter_600SemiBold', fontSize: 8, color: C.accent },
  assigneeName: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textSecondary, maxWidth: 80 },
  overdueBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 10, backgroundColor: C.amberMuted, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: C.amber + '30' },
  overdueBannerText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.amber, flex: 1 },
  boardContainer: { flex: 1, paddingTop: 12 },
  boardScroll: { paddingHorizontal: 12, gap: 12 },
  boardColumn: { width: 260, gap: 10 },
  boardColHeaderGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  boardColDot: { width: 8, height: 8, borderRadius: 4 },
  boardColTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text },
  boardColCount: { backgroundColor: C.cardElevated, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  boardColCountText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.textSecondary },
  boardTaskCard: { backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.borderLight, gap: 6, ...C.shadow.card },
  boardTaskTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.text, lineHeight: 18 },
  boardTaskDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textSecondary },
  boardTaskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dueDatePillCompact: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dueDateTextCompact: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
  assigneePillCompact: { flexDirection: 'row', alignItems: 'center' },
  assigneeAvatarSmall: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.accent + '30', alignItems: 'center', justifyContent: 'center' },
  assigneeInitialsSmall: { fontFamily: 'Inter_600SemiBold', fontSize: 7, color: C.accent },
  boardProgressTrack: { height: 2, borderRadius: 1, backgroundColor: C.border, marginTop: 2, overflow: 'hidden' as const },
  boardProgressFill: { height: 2, borderRadius: 1 },
  boardTaskFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boardEmptyCol: { alignItems: 'center', paddingVertical: 24 },
  boardEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary },
  moveOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'center', alignItems: 'center' },
  moveSheet: { backgroundColor: C.surface, borderRadius: 16, padding: 20, width: '80%', maxWidth: 320 },
  moveTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, color: C.text, marginBottom: 4 },
  moveTaskName: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textSecondary, marginBottom: 16 },
  moveOptions: { gap: 6 },
  moveOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight },
  moveOptionDot: { width: 8, height: 8, borderRadius: 4 },
  moveOptionText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.text, flex: 1 },
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  emptyIconBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: C.text, marginTop: 6 },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary, textAlign: 'center', maxWidth: 280 },
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: '85%' },
  detailModalContent: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: C.text },
  priorityLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.textSecondary },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  priorityBtnText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight },
  statusBtnDot: { width: 6, height: 6, borderRadius: 3 },
  statusBtnText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary },
  saveBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#fff' },
  sortOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: Platform.OS === 'web' ? 120 : 100, paddingRight: 20 },
  sortSheet: { backgroundColor: C.surface, borderRadius: 14, padding: 16, width: 200, gap: 4, ...C.shadow.card },
  sortTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: C.text, marginBottom: 8 },
  sortOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8 },
  sortOptionActive: { backgroundColor: C.primaryMuted },
  sortOptionText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary, flex: 1 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  timestampsContainer: {
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  timestampText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  countText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.primary },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  deferredBanner: { marginHorizontal: 20, marginBottom: 8 },
  deferredBannerGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#8B7FFF30' },
  deferredBannerText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#8B7FFF', flex: 1 },
  reviewFilterRow: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4, gap: 6 },
  reviewChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.card },
  reviewChipActive: { backgroundColor: C.coral + '15' },
  reviewChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary },
  reviewChipTextActive: { color: C.coral },
  memFilterRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 8, alignItems: 'center' as const },
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
  relevanceLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
  relevanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  relevanceBarBg: { flex: 1, height: 4, backgroundColor: C.borderLight, borderRadius: 2, overflow: 'hidden' },
  relevanceBarFill: { height: '100%', backgroundColor: C.coral, borderRadius: 2 },
  relevanceValue: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.coral },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  memTagChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accent + '12', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  memTagChipText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.accent },
  memoryFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  sourceTextBadge: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary, textTransform: 'capitalize' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6 },
  typeBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 10, textTransform: 'uppercase' },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  reviewBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  reviewBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 10, textTransform: 'capitalize' },
  memoryTime: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary, marginLeft: 'auto' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 6 },
  memActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 6, backgroundColor: C.surface },
  actionBtnLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.textTertiary },
  container: { flex: 1, backgroundColor: C.background },
  digestCard: { marginHorizontal: 20, marginTop: 10, marginBottom: 2, borderRadius: 12 },
  digestGradient: { borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.borderLight },
  digestHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  digestTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.text },
  digestGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  digestStat: { alignItems: 'center', flex: 1 },
  digestStatValue: { fontFamily: 'Inter_700Bold', fontSize: 18, color: C.coral },
  digestStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary, marginTop: 2 },
  tagBrowser: { marginHorizontal: 20, marginBottom: 4, backgroundColor: C.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.borderLight },
  tagBrowserTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  tagCloudHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagCloudItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  activeTagBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.accent + '12', borderRadius: 8, marginBottom: 4 },
  activeTagText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.accent, flex: 1 },
  memSortOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  memSortModal: { backgroundColor: C.card, borderRadius: 14, padding: 16, width: 240, borderWidth: 1, borderColor: C.borderLight },
  memSortModalTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text, marginBottom: 12, textAlign: 'center' },
  memSortOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  memSortOptionActive: { backgroundColor: C.coral + '12' },
  memSortOptionText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary, flex: 1 },
  memSortOptionTextActive: { color: C.coral },
  gatewayMemoryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  gatewayMemoryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: C.borderLight },
  gatewayMemoryIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  gatewayMemoryName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text },
  gatewayMemoryPreview: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, marginTop: 2, lineHeight: 16 },
  filesSubHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20, marginBottom: 12, marginTop: 4 },
  syncFilesBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.secondaryMuted, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: C.secondary + '20' },
  syncFilesBtnText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.secondary },
  filesListContent: { paddingHorizontal: 20 },
  filesEmptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  swipeActionDelete: {
    backgroundColor: C.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 8,
    marginLeft: 4,
  },
  swipeActionComplete: {
    backgroundColor: C.success,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 8,
    marginRight: 4,
  },
  input: {
    backgroundColor: C.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
  },

  swipeActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#fff',
    marginTop: 4,
  },
  deleteBtn: { marginTop: 16, padding: 14, borderRadius: 10, backgroundColor: C.error + '15', alignItems: 'center' },
  deleteBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.error, textAlign: 'center' },
  mindMapsSection: { paddingHorizontal: 20, marginBottom: 8, marginTop: 4 },
  mindMapsSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  mindMapsSectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.text },
  mindMapCard: { width: 130, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.borderLight, gap: 6 },
  mindMapCardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.text },
  mindMapCardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mindMapCardMetaText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
});
