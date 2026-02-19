import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/lib/AppContext';
import type { CalendarEvent } from '@/lib/types';

const C = Colors.dark;

type ViewMode = 'month' | 'week' | 'day';

const EVENT_COLORS = [C.coral, C.accent, C.secondary, C.amber, '#8B7FFF', '#FF9F5A'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDateHeader(date: Date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { calendarEvents, createCalendarEvent, deleteCalendarEvent } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAllDay, setNewAllDay] = useState(false);
  const [newHour, setNewHour] = useState('9');
  const [newDuration, setNewDuration] = useState('1');

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const navigateMonth = useCallback((dir: number) => {
    let m = currentMonth + dir;
    let y = currentYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setCurrentMonth(m);
    setCurrentYear(y);
  }, [currentMonth, currentYear]);

  const eventsForDate = useCallback((date: Date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const end = start + 86400000;
    return calendarEvents.filter(
      (e) => (e.startTime >= start && e.startTime < end) || (e.endTime > start && e.endTime <= end) || (e.startTime <= start && e.endTime >= end),
    );
  }, [calendarEvents]);

  const selectedDayEvents = useMemo(() => eventsForDate(selectedDate), [selectedDate, eventsForDate]);

  const weekDays = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(start.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [selectedDate]);

  const handleAddEvent = useCallback(async () => {
    if (!newTitle.trim()) return;
    const hour = parseInt(newHour) || 9;
    const duration = parseFloat(newDuration) || 1;
    const start = new Date(selectedDate);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + duration * 3600000);

    await createCalendarEvent({
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      startTime: start.getTime(),
      endTime: end.getTime(),
      allDay: newAllDay,
      color: EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)],
      source: 'manual',
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewTitle('');
    setNewDescription('');
    setNewAllDay(false);
    setNewHour('9');
    setNewDuration('1');
    setShowAddModal(false);
  }, [newTitle, newDescription, newAllDay, newHour, newDuration, selectedDate, createCalendarEvent]);

  const renderMonthGrid = () => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const today = new Date();
    const cells: React.ReactNode[] = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const isToday = isSameDay(date, today);
      const isSelected = isSameDay(date, selectedDate);
      const dayEvents = eventsForDate(date);
      const hasEvents = dayEvents.length > 0;

      cells.push(
        <Pressable
          key={day}
          style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]}
          onPress={() => {
            setSelectedDate(date);
            Haptics.selectionAsync();
          }}
        >
          <Text style={[styles.dayText, isSelected && styles.dayTextSelected, isToday && !isSelected && styles.dayTextToday]}>
            {day}
          </Text>
          {hasEvents && (
            <View style={styles.eventDots}>
              {dayEvents.slice(0, 3).map((e, i) => (
                <View key={i} style={[styles.eventDot, { backgroundColor: e.color || C.coral }]} />
              ))}
            </View>
          )}
        </Pressable>,
      );
    }

    return (
      <View style={styles.monthGrid}>
        <View style={styles.weekdayRow}>
          {DAYS_SHORT.map((d) => (
            <Text key={d} style={styles.weekdayText}>{d}</Text>
          ))}
        </View>
        <View style={styles.daysGrid}>{cells}</View>
      </View>
    );
  };

  const renderWeekView = () => (
    <View style={styles.weekView}>
      <View style={styles.weekStrip}>
        {weekDays.map((date, i) => {
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, new Date());
          const dayEvents = eventsForDate(date);
          return (
            <Pressable
              key={i}
              style={[styles.weekDay, isSelected && styles.weekDaySelected]}
              onPress={() => {
                setSelectedDate(date);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.weekDayName, isSelected && { color: '#fff' }]}>{DAYS_SHORT[date.getDay()]}</Text>
              <Text style={[styles.weekDayNum, isSelected && { color: '#fff' }, isToday && !isSelected && { color: C.coral }]}>
                {date.getDate()}
              </Text>
              {dayEvents.length > 0 && (
                <View style={[styles.weekDayDot, { backgroundColor: isSelected ? '#fff' : C.coral }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderDayTimeline = () => {
    const hours = Array.from({ length: 16 }, (_, i) => i + 6);
    return (
      <ScrollView style={styles.dayTimeline} showsVerticalScrollIndicator={false}>
        {hours.map((hour) => {
          const hourEvents = selectedDayEvents.filter((e) => {
            const eHour = new Date(e.startTime).getHours();
            return eHour === hour;
          });
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour % 12 || 12;

          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourLabel}>{`${displayHour} ${ampm}`}</Text>
              <View style={styles.hourLine} />
              <View style={styles.hourEvents}>
                {hourEvents.map((e) => (
                  <Pressable
                    key={e.id}
                    style={[styles.timelineEvent, { backgroundColor: (e.color || C.coral) + '25', borderLeftColor: e.color || C.coral }]}
                    onLongPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      deleteCalendarEvent(e.id);
                    }}
                  >
                    <Text style={[styles.timelineEventTitle, { color: e.color || C.coral }]}>{e.title}</Text>
                    <Text style={styles.timelineEventTime}>{formatTime(e.startTime)} - {formatTime(e.endTime)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="calendar-back">
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Calendar</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowAddModal(true);
          }}
          testID="calendar-add"
        >
          <LinearGradient colors={C.gradient.lobster} style={styles.addBtn}>
            <Ionicons name="add" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      <View style={styles.viewToggle}>
        {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
          <Pressable
            key={mode}
            style={[styles.viewToggleBtn, viewMode === mode && styles.viewToggleBtnActive]}
            onPress={() => {
              setViewMode(mode);
              Haptics.selectionAsync();
            }}
          >
            <Text style={[styles.viewToggleText, viewMode === mode && styles.viewToggleTextActive]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {viewMode === 'month' && (
        <View style={styles.monthNav}>
          <Pressable onPress={() => navigateMonth(-1)}>
            <Ionicons name="chevron-back" size={22} color={C.textSecondary} />
          </Pressable>
          <Text style={styles.monthLabel}>{MONTHS[currentMonth]} {currentYear}</Text>
          <Pressable onPress={() => navigateMonth(1)}>
            <Ionicons name="chevron-forward" size={22} color={C.textSecondary} />
          </Pressable>
        </View>
      )}

      {viewMode === 'month' && renderMonthGrid()}
      {viewMode === 'week' && renderWeekView()}

      <View style={styles.selectedDateHeader}>
        <Text style={styles.selectedDateText}>{formatDateHeader(selectedDate)}</Text>
        <Text style={styles.eventCount}>{selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? 's' : ''}</Text>
      </View>

      {viewMode === 'day' ? renderDayTimeline() : (
        <ScrollView style={styles.eventsList} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          {selectedDayEvents.length === 0 ? (
            <View style={styles.emptyDay}>
              <Ionicons name="sunny-outline" size={36} color={C.textTertiary} />
              <Text style={styles.emptyDayText}>No events for this day</Text>
              <Pressable
                onPress={() => setShowAddModal(true)}
                style={styles.emptyAddBtn}
              >
                <Text style={styles.emptyAddText}>Add Event</Text>
              </Pressable>
            </View>
          ) : (
            selectedDayEvents.map((event) => (
              <Pressable
                key={event.id}
                style={styles.eventCard}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  deleteCalendarEvent(event.id);
                }}
              >
                <View style={[styles.eventColorBar, { backgroundColor: event.color || C.coral }]} />
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <View style={styles.eventMeta}>
                    <Ionicons name="time-outline" size={13} color={C.textTertiary} />
                    <Text style={styles.eventTime}>
                      {event.allDay ? 'All Day' : `${formatTime(event.startTime)} - ${formatTime(event.endTime)}`}
                    </Text>
                  </View>
                  {event.location && (
                    <View style={styles.eventMeta}>
                      <Ionicons name="location-outline" size={13} color={C.textTertiary} />
                      <Text style={styles.eventTime}>{event.location}</Text>
                    </View>
                  )}
                  {event.description && (
                    <Text style={styles.eventDesc} numberOfLines={2}>{event.description}</Text>
                  )}
                </View>
                {event.source && (
                  <View style={[styles.sourceBadge, { backgroundColor: (event.color || C.coral) + '20' }]}>
                    <Text style={[styles.sourceText, { color: event.color || C.coral }]}>{event.source}</Text>
                  </View>
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Event</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={C.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Event title"
              placeholderTextColor={C.textTertiary}
              value={newTitle}
              onChangeText={setNewTitle}
              testID="event-title-input"
            />

            <TextInput
              style={[styles.input, { height: 70 }]}
              placeholder="Description (optional)"
              placeholderTextColor={C.textTertiary}
              value={newDescription}
              onChangeText={setNewDescription}
              multiline
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>All Day</Text>
              <Switch
                value={newAllDay}
                onValueChange={setNewAllDay}
                trackColor={{ false: C.border, true: C.coral + '60' }}
                thumbColor={newAllDay ? C.coral : C.textTertiary}
              />
            </View>

            {!newAllDay && (
              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>Start Hour</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={newHour}
                    onChangeText={setNewHour}
                    keyboardType="numeric"
                    placeholderTextColor={C.textTertiary}
                  />
                </View>
                <View style={styles.timeField}>
                  <Text style={styles.timeLabel}>Duration (hrs)</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={newDuration}
                    onChangeText={setNewDuration}
                    keyboardType="numeric"
                    placeholderTextColor={C.textTertiary}
                  />
                </View>
              </View>
            )}

            <Pressable onPress={handleAddEvent} testID="create-event-btn">
              <LinearGradient colors={C.gradient.lobster} style={styles.createBtn}>
                <Text style={styles.createBtnText}>Create Event</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: C.text },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  viewToggle: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.card, borderRadius: 10, padding: 3, marginBottom: 12 },
  viewToggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  viewToggleBtnActive: { backgroundColor: C.coral + '20' },
  viewToggleText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary },
  viewToggleTextActive: { color: C.coral },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
  monthLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: C.text },
  monthGrid: { paddingHorizontal: 12 },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: { flex: 1, textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textTertiary, paddingVertical: 6 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayCellSelected: { backgroundColor: C.coral + '20', borderRadius: 12 },
  dayCellToday: { borderWidth: 1, borderColor: C.coral + '40', borderRadius: 12 },
  dayText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.text },
  dayTextSelected: { color: C.coral, fontFamily: 'Inter_700Bold' },
  dayTextToday: { color: C.coral },
  eventDots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },
  weekView: { paddingHorizontal: 12, marginBottom: 8 },
  weekStrip: { flexDirection: 'row', gap: 4 },
  weekDay: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: C.card },
  weekDaySelected: { backgroundColor: C.coral },
  weekDayName: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary, marginBottom: 4 },
  weekDayNum: { fontFamily: 'Inter_700Bold', fontSize: 16, color: C.text },
  weekDayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  selectedDateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  selectedDateText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text },
  eventCount: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary },
  eventsList: { flex: 1, paddingHorizontal: 16 },
  emptyDay: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyDayText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.textTertiary },
  emptyAddBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.coral + '20', borderRadius: 8 },
  emptyAddText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.coral },
  eventCard: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.borderLight },
  eventColorBar: { width: 4 },
  eventContent: { flex: 1, padding: 12, gap: 4 },
  eventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.text },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventTime: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textTertiary },
  eventDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, marginTop: 2 },
  sourceBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, margin: 8 },
  sourceText: { fontFamily: 'Inter_500Medium', fontSize: 10, textTransform: 'capitalize' },
  dayTimeline: { flex: 1, paddingHorizontal: 16 },
  hourRow: { flexDirection: 'row', minHeight: 56, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  hourLabel: { width: 60, fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary, paddingTop: 4 },
  hourLine: { width: 1, backgroundColor: C.borderLight },
  hourEvents: { flex: 1, paddingLeft: 8, paddingVertical: 2 },
  timelineEvent: { borderLeftWidth: 3, borderRadius: 6, padding: 8, marginBottom: 4 },
  timelineEventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  timelineEventTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: C.text },
  input: { backgroundColor: C.card, borderRadius: 10, padding: 14, fontFamily: 'Inter_400Regular', fontSize: 14, color: C.text, marginBottom: 12, borderWidth: 1, borderColor: C.borderLight },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  switchLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.text },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  timeField: { flex: 1 },
  timeLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: C.textSecondary, marginBottom: 4 },
  timeInput: { backgroundColor: C.card, borderRadius: 10, padding: 12, fontFamily: 'Inter_500Medium', fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.borderLight, textAlign: 'center' },
  createBtn: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  createBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
});
