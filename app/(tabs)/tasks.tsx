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
  deferred: { label: 'Deferred', color: C.textTertiary, icon: 'pause-circle-outline' },
};

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  urgent: { color: C.primary, label: 'Urgent' },
  high: { color: C.amber, label: 'High' },
  medium: { color: C.accent, label: 'Medium' },
  low: { color: C.textSecondary, label: 'Low' },
};

type ViewMode = 'list' | 'board';

function TaskCard({
  task,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  const status = STATUS_CONFIG[task.status];
  const priority = PRIORITY_CONFIG[task.priority];
  const ago = formatAge(task.updatedAt);

  const nextStatus: TaskStatus =
    task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo';

  return (
    <Pressable
      style={({ pressed }) => [styles.taskCard, pressed && { backgroundColor: C.cardElevated }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onStatusChange(nextStatus);
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onDelete();
      }}
    >
      <View style={styles.taskCardTop}>
        <Ionicons name={status.icon as any} size={20} color={status.color} />
        <View style={styles.taskCardContent}>
          <Text
            style={[
              styles.taskTitle,
              task.status === 'done' && styles.taskTitleDone,
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
        <Text style={styles.taskAge}>{ago}</Text>
      </View>
    </Pressable>
  );
}

function formatAge(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatsBar({ tasks }: { tasks: Task[] }) {
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const inProg = tasks.filter((t) => t.status === 'in_progress').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length || 1;

  return (
    <View style={styles.statsBar}>
      <View style={styles.statsItems}>
        <View style={styles.statsItem}>
          <Text style={[styles.statsNum, { color: C.textSecondary }]}>{todo}</Text>
          <Text style={styles.statsLabel}>To Do</Text>
        </View>
        <View style={styles.statsItem}>
          <Text style={[styles.statsNum, { color: C.amber }]}>{inProg}</Text>
          <Text style={styles.statsLabel}>Active</Text>
        </View>
        <View style={styles.statsItem}>
          <Text style={[styles.statsNum, { color: C.success }]}>{done}</Text>
          <Text style={styles.statsLabel}>Done</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        {done > 0 && (
          <View style={[styles.progressSeg, { flex: done / total, backgroundColor: C.success }]} />
        )}
        {inProg > 0 && (
          <View style={[styles.progressSeg, { flex: inProg / total, backgroundColor: C.amber }]} />
        )}
        {todo > 0 && (
          <View style={[styles.progressSeg, { flex: todo / total, backgroundColor: C.textTertiary }]} />
        )}
      </View>
    </View>
  );
}

function BoardColumn({ title, tasks: columnTasks, color, onStatusChange, onDelete }: {
  title: string;
  tasks: Task[];
  color: string;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <View style={styles.boardColumn}>
      <View style={styles.boardColHeader}>
        <View style={[styles.boardColDot, { backgroundColor: color }]} />
        <Text style={styles.boardColTitle}>{title}</Text>
        <View style={styles.boardColCount}>
          <Text style={styles.boardColCountText}>{columnTasks.length}</Text>
        </View>
      </View>
      <FlatList
        data={columnTasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onStatusChange={(s) => onStatusChange(item.id, s)}
            onDelete={() => onDelete(item)}
          />
        )}
        contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
        scrollEnabled={columnTasks.length > 0}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { tasks, createTask, updateTask, deleteTask } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('medium');

  const filteredTasks = useMemo(() => {
    let items = [...tasks];
    if (statusFilter !== 'all') {
      items = items.filter((t) => t.status === statusFilter);
    }
    items.sort((a, b) => {
      const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return pOrder[a.priority] - pOrder[b.priority] || b.updatedAt - a.updatedAt;
    });
    return items;
  }, [tasks, statusFilter]);

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
    await createTask(newTitle.trim(), 'todo', newPriority, newDesc.trim() || undefined);
    setNewTitle('');
    setNewDesc('');
    setNewPriority('medium');
    setShowAddModal(false);
  }, [newTitle, newDesc, newPriority, createTask]);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
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
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <LinearGradient colors={C.gradient.lobster} style={styles.addBtnGrad}>
              <Ionicons name="add" size={22} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      <StatsBar tasks={tasks} />

      {viewMode === 'list' && (
        <>
          <View style={styles.filterRow}>
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'todo', label: 'To Do' },
                { key: 'in_progress', label: 'Active' },
                { key: 'done', label: 'Done' },
              ] as const
            ).map((f) => (
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
          </View>

          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TaskCard
                task={item}
                onStatusChange={(s) => handleStatusChange(item.id, s)}
                onDelete={() => handleDelete(item)}
              />
            )}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 100 },
              filteredTasks.length === 0 && styles.emptyContainer,
            ]}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            scrollEnabled={filteredTasks.length > 0}
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
            data={[
              { status: 'todo' as TaskStatus, title: 'To Do', color: C.textSecondary },
              { status: 'in_progress' as TaskStatus, title: 'In Progress', color: C.amber },
              { status: 'done' as TaskStatus, title: 'Done', color: C.success },
            ]}
            horizontal
            keyExtractor={(item) => item.status}
            renderItem={({ item }) => (
              <BoardColumn
                title={item.title}
                tasks={tasks.filter((t) => t.status === item.status).sort((a, b) => b.updatedAt - a.updatedAt)}
                color={item.color}
                onStatusChange={handleStatusChange}
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

            <Pressable
              onPress={handleAddTask}
              style={({ pressed }) => [
                styles.saveBtn,
                !newTitle.trim() && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
              disabled={!newTitle.trim()}
            >
              <Text style={styles.saveBtnText}>Create Task</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: C.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: 'hidden',
  },
  viewBtn: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtnActive: {
    backgroundColor: C.cardElevated,
  },
  addBtnGrad: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBar: {
    marginHorizontal: 20,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 10,
  },
  statsItems: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statsItem: {
    alignItems: 'center',
  },
  statsNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  statsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
    marginTop: 2,
  },
  progressTrack: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: C.border,
  },
  progressSeg: {
    height: 4,
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
    paddingTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  taskCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 10,
  },
  taskCardTop: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  taskCardContent: {
    flex: 1,
  },
  taskTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: C.textTertiary,
  },
  taskDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 3,
  },
  taskCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 30,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  priorityText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  tagPill: {
    backgroundColor: C.accentMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.accent,
  },
  taskAge: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: C.textTertiary,
    marginLeft: 'auto',
  },
  boardContainer: {
    flex: 1,
    paddingTop: 12,
  },
  boardScroll: {
    paddingHorizontal: 12,
    gap: 12,
  },
  boardColumn: {
    width: 280,
    gap: 10,
  },
  boardColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  boardColDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  boardColTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
  },
  boardColCount: {
    backgroundColor: C.cardElevated,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  boardColCountText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 30,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.textSecondary,
    marginTop: 6,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textTertiary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: C.text,
  },
  input: {
    backgroundColor: C.inputBackground,
    borderRadius: 12,
    padding: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
  },
  priorityLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.textSecondary,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  priorityBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.textSecondary,
  },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: Platform.OS === 'web' ? 34 : 20,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
});
