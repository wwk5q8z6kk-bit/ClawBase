import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { Task, TaskStatus } from '@/lib/types';

const C = Colors.dark;

const COLUMNS: { status: TaskStatus; title: string; color: string }[] = [
  { status: 'todo', title: 'To Do', color: C.warning },
  { status: 'in_progress', title: 'In Progress', color: C.accent },
  { status: 'done', title: 'Done', color: C.success },
  { status: 'deferred', title: 'Deferred', color: C.textTertiary },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: C.primary,
  high: C.warning,
  medium: C.accent,
  low: C.textTertiary,
};

function TaskCard({
  task,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  const nextStatus: Record<TaskStatus, TaskStatus> = {
    todo: 'in_progress',
    in_progress: 'done',
    done: 'todo',
    deferred: 'todo',
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.taskCard,
        pressed && { opacity: 0.8 },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onStatusChange(nextStatus[task.status]);
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onDelete();
      }}
    >
      <View style={styles.taskHeader}>
        <View
          style={[
            styles.priorityDot,
            { backgroundColor: PRIORITY_COLORS[task.priority] },
          ]}
        />
        <Text style={styles.taskPriority}>
          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
        </Text>
      </View>
      <Text style={styles.taskTitle} numberOfLines={2}>
        {task.title}
      </Text>
      {task.description ? (
        <Text style={styles.taskDesc} numberOfLines={1}>
          {task.description}
        </Text>
      ) : null}
      <View style={styles.taskFooter}>
        <Ionicons name="arrow-forward" size={14} color={C.textTertiary} />
        <Text style={styles.taskFooterText}>
          {nextStatus[task.status] === 'in_progress'
            ? 'Start'
            : nextStatus[task.status] === 'done'
              ? 'Complete'
              : 'Restart'}
        </Text>
      </View>
    </Pressable>
  );
}

function KanbanColumn({
  title,
  color,
  tasks,
  onStatusChange,
  onDelete,
}: {
  title: string;
  color: string;
  tasks: Task[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View style={styles.column}>
      <View style={styles.columnHeader}>
        <View style={[styles.columnDot, { backgroundColor: color }]} />
        <Text style={styles.columnTitle}>{title}</Text>
        <View style={[styles.countBadge, { backgroundColor: color + '25' }]}>
          <Text style={[styles.countText, { color }]}>{tasks.length}</Text>
        </View>
      </View>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onStatusChange={(s) => onStatusChange(task.id, s)}
          onDelete={() => onDelete(task.id)}
        />
      ))}
      {tasks.length === 0 && (
        <View style={styles.emptyColumn}>
          <Text style={styles.emptyColumnText}>No tasks</Text>
        </View>
      )}
    </View>
  );
}

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { tasks, createTask, updateTask, deleteTask } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('medium');

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
      deferred: [],
    };
    tasks.forEach((t) => {
      grouped[t.status]?.push(t);
    });
    return grouped;
  }, [tasks]);

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await createTask(newTitle.trim(), 'todo', newPriority, newDesc.trim() || undefined);
    setNewTitle('');
    setNewDesc('');
    setNewPriority('medium');
    setShowAddModal(false);
  }, [newTitle, newDesc, newPriority, createTask]);

  const handleStatusChange = useCallback(
    (id: string, status: TaskStatus) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateTask(id, { status });
    },
    [updateTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (Platform.OS === 'web') {
        deleteTask(id);
        return;
      }
      Alert.alert('Delete Task', 'Remove this task?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteTask(id),
        },
      ]);
    },
    [deleteTask],
  );

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tasks</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowAddModal(true);
          }}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add" size={24} color={C.primary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.kanbanScroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        decelerationRate="fast"
        snapToInterval={280 + 12}
      >
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            title={col.title}
            color={col.color}
            tasks={tasksByStatus[col.status]}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        ))}
      </ScrollView>

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
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                <Pressable
                  key={p}
                  style={[
                    styles.priorityChip,
                    newPriority === p && {
                      backgroundColor: PRIORITY_COLORS[p] + '30',
                      borderColor: PRIORITY_COLORS[p],
                    },
                  ]}
                  onPress={() => setNewPriority(p)}
                >
                  <View
                    style={[
                      styles.priorityChipDot,
                      { backgroundColor: PRIORITY_COLORS[p] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.priorityChipText,
                      newPriority === p && { color: C.text },
                    ]}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={handleAdd}
              style={({ pressed }) => [
                styles.addTaskBtn,
                !newTitle.trim() && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
              disabled={!newTitle.trim()}
            >
              <Text style={styles.addTaskBtnText}>Create Task</Text>
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
  addBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kanbanScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  column: {
    width: 280,
    gap: 10,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  columnDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  columnTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: C.text,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  taskCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    gap: 6,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  taskPriority: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taskTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: C.text,
  },
  taskDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textSecondary,
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  taskFooterText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: C.textTertiary,
  },
  emptyColumn: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.borderLight,
    borderStyle: 'dashed',
  },
  emptyColumnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.textTertiary,
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
    fontSize: 14,
    color: C.text,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  priorityChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.textSecondary,
  },
  addTaskBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: Platform.OS === 'web' ? 34 : 20,
  },
  addTaskBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: C.text,
  },
});
