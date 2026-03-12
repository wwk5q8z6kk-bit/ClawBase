import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Animated,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import Colors from '@/constants/colors';
import { focusStorage } from '@/lib/storage';
import { useApp } from '@/lib/AppContext';
import type { FocusMode, FocusSession, Task } from '@/lib/types';

const C = Colors.dark;

const MODE_CONFIG: Record<FocusMode, { label: string; icon: string; duration: number; breakDuration: number; color: string; description: string }> = {
  pomodoro: { label: 'Pomodoro', icon: 'flame', duration: 25 * 60, breakDuration: 5 * 60, color: C.primary, description: '25 min work / 5 min break' },
  short: { label: 'Short Focus', icon: 'flash', duration: 15 * 60, breakDuration: 3 * 60, color: C.amber, description: '15 min sprint' },
  deep: { label: 'Deep Work', icon: 'rocket', duration: 50 * 60, breakDuration: 10 * 60, color: C.accent, description: '50 min work / 10 min break' },
  custom: { label: 'Custom', icon: 'options', duration: 30 * 60, breakDuration: 5 * 60, color: C.purple, description: 'Set your own duration' },
};

const MODES: FocusMode[] = ['pomodoro', 'short', 'deep', 'custom'];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  }
  return `${m}m`;
}

function formatSessionDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function SessionHistoryItem({ session }: { session: FocusSession }) {
  const config = MODE_CONFIG[session.mode];
  return (
    <View style={s.historyItem}>
      <View style={[s.historyIcon, { backgroundColor: config.color + '15' }]}>
        <Ionicons name={config.icon as any} size={16} color={config.color} />
      </View>
      <View style={s.historyInfo}>
        <Text style={s.historyTitle} numberOfLines={1}>
          {session.taskTitle || config.label}
        </Text>
        <Text style={s.historyMeta}>
          {formatDuration(session.duration)} {session.completed ? '' : '(incomplete)'}
        </Text>
      </View>
      <View style={s.historyRight}>
        <Text style={s.historyDate}>{formatSessionDate(session.startedAt)}</Text>
        {session.completed && (
          <Ionicons name="checkmark-circle" size={14} color={C.success} />
        )}
      </View>
    </View>
  );
}

export default function FocusScreen() {
  const insets = useSafeAreaInsets();
  const { tasks } = useApp();
  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const [selectedMode, setSelectedMode] = useState<FocusMode>('pomodoro');
  const [customMinutes, setCustomMinutes] = useState(30);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MODE_CONFIG.pomodoro.duration);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [linkedTask, setLinkedTask] = useState<Task | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const totalDuration = useMemo(() => {
    if (isBreak) return MODE_CONFIG[selectedMode].breakDuration;
    if (selectedMode === 'custom') return customMinutes * 60;
    return MODE_CONFIG[selectedMode].duration;
  }, [selectedMode, customMinutes, isBreak]);

  useEffect(() => {
    focusStorage.getAll().then(setSessions).catch((e) => console.warn('[Focus] Failed to load sessions:', e));
  }, []);

  useEffect(() => {
    if (!isRunning) {
      if (selectedMode === 'custom') {
        setTimeLeft(customMinutes * 60);
      } else {
        setTimeLeft(MODE_CONFIG[selectedMode].duration);
      }
    }
  }, [selectedMode, customMinutes, isRunning]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRunning, isPaused, pulseAnim]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      const elapsed = totalDuration - timeLeft;
      const progress = totalDuration > 0 ? elapsed / totalDuration : 0;
      Animated.timing(progressAnim, { toValue: progress, duration: 300, useNativeDriver: false }).start();
    }
  }, [timeLeft, totalDuration, isRunning, isPaused, progressAnim]);

  const handleTimerComplete = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (!isBreak) {
      if (currentSessionId) {
        try {
          await focusStorage.update(currentSessionId, { completed: true, completedAt: Date.now() });
          const updated = await focusStorage.getAll();
          setSessions(updated);
        } catch (e) {
          console.warn('[Focus] Failed to mark session complete:', e);
        }
      }

      const breakDur = MODE_CONFIG[selectedMode].breakDuration;
      if (breakDur > 0) {
        setIsBreak(true);
        setTimeLeft(breakDur);
        progressAnim.setValue(0);
        return;
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    setIsBreak(false);
    setCurrentSessionId(null);
    progressAnim.setValue(0);
    if (selectedMode === 'custom') {
      setTimeLeft(customMinutes * 60);
    } else {
      setTimeLeft(MODE_CONFIG[selectedMode].duration);
    }
  }, [isBreak, selectedMode, customMinutes, currentSessionId, progressAnim]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isPaused, handleTimerComplete]);

  const startTimer = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const duration = selectedMode === 'custom' ? customMinutes * 60 : MODE_CONFIG[selectedMode].duration;
    const sessionId = Crypto.randomUUID();

    const session: FocusSession = {
      id: sessionId,
      mode: selectedMode,
      taskId: linkedTask?.id,
      taskTitle: linkedTask?.title,
      duration,
      breakDuration: MODE_CONFIG[selectedMode].breakDuration,
      startedAt: Date.now(),
      completed: false,
    };

    try {
      await focusStorage.add(session);
      setSessions(await focusStorage.getAll());
    } catch (e) {
      console.warn('[Focus] Failed to save focus session:', e);
    }
    setCurrentSessionId(sessionId);
    setIsRunning(true);
    setIsPaused(false);
    setIsBreak(false);
    setTimeLeft(duration);
    progressAnim.setValue(0);
  }, [selectedMode, customMinutes, linkedTask, progressAnim]);

  const pauseTimer = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPaused(true);
  }, []);

  const resumeTimer = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPaused(false);
  }, []);

  const resetTimer = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    setIsPaused(false);
    setIsBreak(false);
    setCurrentSessionId(null);
    progressAnim.setValue(0);
    if (selectedMode === 'custom') {
      setTimeLeft(customMinutes * 60);
    } else {
      setTimeLeft(MODE_CONFIG[selectedMode].duration);
    }
  }, [selectedMode, customMinutes, progressAnim]);

  const skipBreak = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    setIsPaused(false);
    setIsBreak(false);
    setCurrentSessionId(null);
    progressAnim.setValue(0);
    if (selectedMode === 'custom') {
      setTimeLeft(customMinutes * 60);
    } else {
      setTimeLeft(MODE_CONFIG[selectedMode].duration);
    }
  }, [selectedMode, customMinutes, progressAnim]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.status !== 'archived'),
    [tasks],
  );

  const todaySessions = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return sessions.filter((s) => s.startedAt >= todayStart.getTime() && s.completed);
  }, [sessions]);

  const todayMinutes = useMemo(
    () => Math.round(todaySessions.reduce((acc, s) => acc + s.duration, 0) / 60),
    [todaySessions],
  );

  const config = MODE_CONFIG[selectedMode];
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  if (showTaskPicker) {
    return (
      <View style={[s.container, { paddingTop: insets.top + webTopPad }]}>
        <View style={s.pickerHeader}>
          <Pressable onPress={() => setShowTaskPicker(false)} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </Pressable>
          <Text style={s.pickerTitle}>Link a Task</Text>
          <Pressable onPress={() => { setLinkedTask(null); setShowTaskPicker(false); }} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <Text style={s.pickerClear}>Clear</Text>
          </Pressable>
        </View>
        <FlatList
          data={activeTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: insets.bottom + 20 }}
          scrollEnabled={activeTasks.length > 0}
          ListEmptyComponent={
            <View style={s.emptyTasks}>
              <Ionicons name="checkbox-outline" size={32} color={C.textTertiary} />
              <Text style={s.emptyTasksText}>No active tasks</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = linkedTask?.id === item.id;
            const priorityColor = item.priority === 'urgent' ? C.primary : item.priority === 'high' ? C.amber : item.priority === 'low' ? C.textTertiary : C.textSecondary;
            return (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setLinkedTask(item);
                  setShowTaskPicker(false);
                }}
                style={({ pressed }) => [s.taskPickerItem, isSelected && s.taskPickerItemSelected, pressed && { opacity: 0.7 }]}
              >
                <View style={[s.taskPickerDot, { backgroundColor: priorityColor }]} />
                <Text style={s.taskPickerTitle} numberOfLines={1}>{item.title}</Text>
                {isSelected && <Ionicons name="checkmark" size={18} color={C.primary} />}
              </Pressable>
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </Pressable>
        <Text style={s.headerTitle}>Focus</Text>
        <View style={{ width: 24 }} />
      </View>

      {!isRunning ? (
        <View style={s.setupContent}>
          <View style={s.modeGrid}>
            {MODES.map((mode) => {
              const mc = MODE_CONFIG[mode];
              const isActive = selectedMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedMode(mode);
                  }}
                  style={({ pressed }) => [
                    s.modeCard,
                    isActive && { borderColor: mc.color, backgroundColor: mc.color + '10' },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Ionicons name={mc.icon as any} size={22} color={isActive ? mc.color : C.textTertiary} />
                  <Text style={[s.modeLabel, isActive && { color: mc.color }]}>{mc.label}</Text>
                  <Text style={s.modeDesc}>{mc.description}</Text>
                </Pressable>
              );
            })}
          </View>

          {selectedMode === 'custom' && (
            <View style={s.customRow}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCustomMinutes((v) => Math.max(5, v - 5)); }}
                style={({ pressed }) => [s.customBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="remove" size={20} color={C.text} />
              </Pressable>
              <View style={s.customDisplay}>
                <Text style={s.customValue}>{customMinutes}</Text>
                <Text style={s.customUnit}>min</Text>
              </View>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCustomMinutes((v) => Math.min(120, v + 5)); }}
                style={({ pressed }) => [s.customBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="add" size={20} color={C.text} />
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={() => setShowTaskPicker(true)}
            style={({ pressed }) => [s.linkTaskBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="link-outline" size={18} color={linkedTask ? config.color : C.textTertiary} />
            <Text style={[s.linkTaskText, linkedTask && { color: C.text }]} numberOfLines={1}>
              {linkedTask ? linkedTask.title : 'Link a task (optional)'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
          </Pressable>

          <Pressable onPress={startTimer} style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}>
            <LinearGradient
              colors={[config.color, config.color + 'CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.startBtn}
            >
              <Ionicons name="play" size={24} color="#fff" />
              <Text style={s.startBtnText}>Start Focus</Text>
            </LinearGradient>
          </Pressable>

          {todaySessions.length > 0 && (
            <View style={s.todayStats}>
              <Ionicons name="trending-up" size={16} color={C.success} />
              <Text style={s.todayStatsText}>
                {todaySessions.length} session{todaySessions.length !== 1 ? 's' : ''} today ({todayMinutes} min)
              </Text>
            </View>
          )}

          {sessions.length > 0 && (
            <View style={s.historySection}>
              <Text style={s.historySectionTitle}>Recent Sessions</Text>
              {sessions.slice(0, 5).map((session) => (
                <SessionHistoryItem key={session.id} session={session} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={s.timerContent}>
          {isBreak && (
            <View style={s.breakBanner}>
              <Ionicons name="cafe" size={16} color={C.success} />
              <Text style={s.breakBannerText}>Break Time</Text>
            </View>
          )}

          {linkedTask && (
            <View style={s.linkedTaskBanner}>
              <Ionicons name="link" size={14} color={config.color} />
              <Text style={s.linkedTaskName} numberOfLines={1}>{linkedTask.title}</Text>
            </View>
          )}

          <View style={s.timerDisplayContainer}>
            <Animated.View style={[s.timerRing, { borderColor: isBreak ? C.success + '30' : config.color + '30', transform: [{ scale: pulseAnim }] }]}>
              <View style={[s.timerInner, { borderColor: isBreak ? C.success + '15' : config.color + '15' }]}>
                <Text style={[s.timerText, { color: isBreak ? C.success : config.color }]}>
                  {formatTime(timeLeft)}
                </Text>
                <Text style={s.timerMode}>{isBreak ? 'Break' : config.label}</Text>
              </View>
            </Animated.View>
          </View>

          <View style={s.progressBarTrack}>
            <Animated.View style={[s.progressBarFill, { width: progressWidth, backgroundColor: isBreak ? C.success : config.color }]} />
          </View>

          <View style={s.timerControls}>
            {isBreak ? (
              <Pressable onPress={skipBreak} style={({ pressed }) => [s.controlBtn, pressed && { opacity: 0.6 }]}>
                <Ionicons name="play-skip-forward" size={24} color={C.text} />
                <Text style={s.controlLabel}>Skip Break</Text>
              </Pressable>
            ) : (
              <>
                <Pressable onPress={resetTimer} style={({ pressed }) => [s.controlBtn, pressed && { opacity: 0.6 }]}>
                  <Ionicons name="refresh" size={24} color={C.textSecondary} />
                  <Text style={s.controlLabel}>Reset</Text>
                </Pressable>

                {isPaused ? (
                  <Pressable onPress={resumeTimer} style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.95 }] }]}>
                    <LinearGradient colors={[config.color, config.color + 'CC']} style={s.mainControlBtn}>
                      <Ionicons name="play" size={32} color="#fff" />
                    </LinearGradient>
                  </Pressable>
                ) : (
                  <Pressable onPress={pauseTimer} style={({ pressed }) => [s.pauseBtn, pressed && { opacity: 0.8 }]}>
                    <Ionicons name="pause" size={32} color={C.text} />
                  </Pressable>
                )}

                <Pressable onPress={resetTimer} style={({ pressed }) => [s.controlBtn, pressed && { opacity: 0.6 }]}>
                  <Ionicons name="stop" size={24} color={C.error} />
                  <Text style={s.controlLabel}>Stop</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: C.text },

  setupContent: { flex: 1, paddingHorizontal: 20, gap: 20 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modeCard: {
    width: '48%' as any,
    flexGrow: 1,
    flexBasis: '46%' as any,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    gap: 6,
  },
  modeLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text },
  modeDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },

  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  customBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customDisplay: { alignItems: 'center' },
  customValue: { fontFamily: 'Inter_700Bold', fontSize: 36, color: C.text },
  customUnit: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary },

  linkTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  linkTaskText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, color: C.textTertiary },

  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 16,
  },
  startBtnText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#fff' },

  todayStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  todayStatsText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.success },

  historySection: { gap: 8 },
  historySectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text, marginBottom: 4 },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  historyIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyInfo: { flex: 1, gap: 2 },
  historyTitle: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.text },
  historyMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  historyRight: { alignItems: 'flex-end', gap: 2 },
  historyDate: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },

  timerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 24 },

  breakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.successMuted,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  breakBannerText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.success },

  linkedTaskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '80%' as any,
  },
  linkedTaskName: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.text, flex: 1 },

  timerDisplayContainer: { alignItems: 'center', justifyContent: 'center' },
  timerRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerInner: {
    width: 196,
    height: 196,
    borderRadius: 98,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  timerText: { fontFamily: 'Inter_700Bold', fontSize: 48, letterSpacing: 2 },
  timerMode: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.textSecondary, marginTop: 4 },

  progressBarTrack: {
    width: '80%' as any,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    overflow: 'hidden' as const,
  },
  progressBarFill: { height: 4, borderRadius: 2 },

  timerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginTop: 16,
  },
  controlBtn: { alignItems: 'center', gap: 4 },
  controlLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textSecondary },
  mainControlBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.card,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  pickerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: C.text },
  pickerClear: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.primary },

  taskPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  taskPickerItemSelected: { borderColor: C.primary, backgroundColor: C.primaryMuted },
  taskPickerDot: { width: 8, height: 8, borderRadius: 4 },
  taskPickerTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.text, flex: 1 },

  emptyTasks: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  emptyTasksText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textTertiary },
});
