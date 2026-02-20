import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { Task, TaskStatus } from '@/lib/types';

const C = Colors.dark;

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
type SortMode = 'priority' | 'dueDate' | 'newest' | 'alphabetical';

const SORT_OPTIONS: { key: SortMode; label: string; icon: string }[] = [
  { key: 'priority', label: 'Priority', icon: 'flag-outline' },
  { key: 'dueDate', label: 'Due Date', icon: 'calendar-outline' },
  { key: 'newest', label: 'Newest First', icon: 'time-outline' },
  { key: 'alphabetical', label: 'Alphabetical', icon: 'text-outline' },
];

function formatAge(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

const STATUS_PROGRESS: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 0.5,
  done: 1,
  deferred: 0.25,
  archived: 0,
};

function TaskCard({
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
  }, [task?.id]);

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 100 }}>
        {columnTasks.map((task) => {
          const progress = STATUS_PROGRESS[task.status];
          const statusColor = STATUS_CONFIG[task.status].color;
          const statusCycle: TaskStatus[] = ['todo', 'in_progress', 'done', 'deferred', 'archived'];
          const currentIdx = statusCycle.indexOf(task.status);
          const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length];
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

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { tasks, createTask, updateTask, deleteTask } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [showSortModal, setShowSortModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [moveTask, setMoveTask] = useState<Task | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('medium');
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo');
  const [newDueDate, setNewDueDate] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newAssignee, setNewAssignee] = useState('');

  const filteredTasks = useMemo(() => {
    let items = [...tasks];
    if (statusFilter !== 'all') {
      items = items.filter((t) => t.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    switch (sortMode) {
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
  }, [tasks, statusFilter, searchQuery, sortMode]);

  const handleStatusChange = useCallback(
    (id: string, status: TaskStatus) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateTask(id, { status });
    },
    [updateTask],
  );

  const handleDelete = useCallback(
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
    if (!newTitle.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await createTask(newTitle.trim(), newStatus, newPriority, newDesc.trim() || undefined);

    const dueTs = parseDueDateInput(newDueDate);
    const tagsList = newTags.trim()
      ? newTags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;
    const assigneeVal = newAssignee.trim() || undefined;

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

    setNewTitle('');
    setNewDesc('');
    setNewPriority('medium');
    setNewStatus('todo');
    setNewDueDate('');
    setNewTags('');
    setNewAssignee('');
    setShowAddModal(false);
  }, [newTitle, newDesc, newPriority, newStatus, newDueDate, newTags, newAssignee, createTask, tasks, updateTask]);

  const handleMoveTask = useCallback((task: Task) => {
    setMoveTask(task);
    setShowMoveModal(true);
  }, []);

  const handleOpenDetail = useCallback((task: Task) => {
    setDetailTask(task);
    setShowDetailModal(true);
  }, []);

  const handleDetailSave = useCallback((id: string, updates: Partial<Task>) => {
    updateTask(id, updates);
  }, [updateTask]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={C.gradient.ocean} style={styles.headerGradient}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tasks</Text>
          <View style={styles.headerActions}>
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
            <Pressable onPress={() => setShowSortModal(true)}>
              <Ionicons name="swap-vertical-outline" size={22} color={C.textSecondary} />
            </Pressable>
            <Pressable
              testID="add-task-btn"
              onPress={() => setShowAddModal(true)}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <LinearGradient colors={C.gradient.lobster} style={styles.addBtnGrad}>
                <Ionicons name="add" size={22} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <StatsBar tasks={tasks} />

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          placeholderTextColor={C.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
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
        <>
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

          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TaskCard
                task={item}
                onPress={() => handleOpenDetail(item)}
                onLongPress={() => handleMoveTask(item)}
                onStatusChange={handleStatusChange}
              />
            )}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 100 },
              filteredTasks.length === 0 && styles.emptyContainer,
            ]}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            scrollEnabled={!!filteredTasks.length}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="checkbox-outline" size={44} color={C.textTertiary} />
                <Text style={styles.emptyTitle}>No tasks yet</Text>
                <Text style={styles.emptySubtitle}>
                  Tap + to create your first task
                </Text>
              </View>
            }
          />
        </>
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
                onDelete={handleDelete}
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
        onMove={handleStatusChange}
      />

      <TaskDetailModal
        visible={showDetailModal}
        task={detailTask}
        onClose={() => { setShowDetailModal(false); setDetailTask(null); }}
        onSave={handleDetailSave}
        onDelete={handleDelete}
      />

      <Modal visible={showSortModal} transparent animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <Pressable style={styles.sortOverlay} onPress={() => setShowSortModal(false)}>
          <View style={styles.sortSheet}>
            <Text style={styles.sortTitle}>Sort By</Text>
            {SORT_OPTIONS.map((opt) => {
              const isActive = sortMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.sortOption, isActive && styles.sortOptionActive]}
                  onPress={() => {
                    setSortMode(opt.key);
                    setShowSortModal(false);
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
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Task</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={C.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
              <TextInput
                style={styles.input}
                placeholder="Task title"
                placeholderTextColor={C.textTertiary}
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
              />
              <TextInput
                style={[styles.input, { height: 80 }]}
                placeholder="Description (optional)"
                placeholderTextColor={C.textTertiary}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.priorityLabel}>Priority</Text>
              <View style={styles.priorityRow}>
                {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                  const pConfig = PRIORITY_CONFIG[p];
                  const selected = newPriority === p;
                  return (
                    <Pressable
                      key={p}
                      style={[
                        styles.priorityBtn,
                        selected && { backgroundColor: pConfig.color + '20', borderColor: pConfig.color },
                      ]}
                      onPress={() => setNewPriority(p)}
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
                  const selected = newStatus === col.status;
                  return (
                    <Pressable
                      key={col.status}
                      style={[styles.statusBtn, selected && { backgroundColor: col.color + '20', borderColor: col.color }]}
                      onPress={() => setNewStatus(col.status)}
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
                value={newDueDate}
                onChangeText={setNewDueDate}
              />

              <Text style={styles.priorityLabel}>Tags (comma separated, optional)</Text>
              <TextInput
                style={styles.input}
                placeholder='e.g. "design, frontend, urgent"'
                placeholderTextColor={C.textTertiary}
                value={newTags}
                onChangeText={setNewTags}
              />

              <Text style={styles.priorityLabel}>Assignee (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Doe"
                placeholderTextColor={C.textTertiary}
                value={newAssignee}
                onChangeText={setNewAssignee}
              />

              <Pressable
                onPress={handleAddTask}
                style={({ pressed }) => [
                  !newTitle.trim() && { opacity: 0.4 },
                  pressed && { opacity: 0.8 },
                ]}
                disabled={!newTitle.trim()}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  headerGradient: { paddingBottom: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: C.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  filterRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight },
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
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.accent },
  sourcePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  sourceText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: C.textTertiary },
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
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: C.textSecondary, marginTop: 6 },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: '85%' },
  detailModalContent: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: C.text },
  input: { backgroundColor: C.inputBackground, borderRadius: 12, padding: 14, fontFamily: 'Inter_400Regular', fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border },
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
  detailRowText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, flex: 1 },
  timestampsContainer: {
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  timestampText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  deleteBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: Platform.OS === 'web' ? 34 : 20 },
  deleteBtnText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.primary },
});
