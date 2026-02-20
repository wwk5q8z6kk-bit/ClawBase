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
  Alert,
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

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editHour, setEditHour] = useState('9');
  const [editDuration, setEditDuration] = useState('1');
  const [editAllDay, setEditAllDay] = useState(false);
  const [editColor, setEditColor] = useState(C.coral);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const today = new Date();
  const isViewingCurrentMonth = currentMonth === today.getMonth() && currentYear === today.getFullYear();

  const navigateMonth = useCallback((dir: number) => {
    let m = currentMonth + dir;
    let y = currentYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setCurrentMonth(m);
    setCurrentYear(y);
  }, [currentMonth, currentYear]);

  const jumpToToday = useCallback(() => {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    setSelectedDate(now);
    Haptics.selectionAsync();
  }, []);

  const eventsForDate = useCallback((date: Date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const end = start + 86400000;
    return calendarEvents.filter(
      (e) => (e.startTime >= start && e.startTime < end) || (e.endTime > start && e.endTime <= end) || (e.startTime <= start && e.endTime >= end),
    );
  }, [calendarEvents]);

  const selectedDayEvents = useMemo(() => eventsForDate(selectedDate), [selectedDate, eventsForDate]);

  const todayEvents = useMemo(() => eventsForDate(new Date()), [eventsForDate]);
  const nextUpcomingEvent = useMemo(() => {
    const now = Date.now();
    const upcoming = calendarEvents
      .filter((e) => e.startTime > now)
      .sort((a, b) => a.startTime - b.startTime);
    return upcoming[0] || null;
  }, [calendarEvents]);

  const formatDuration = useCallback((startTime: number, endTime: number) => {
    const diffMs = endTime - startTime;
    const totalMin = Math.round(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }, []);

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

  const openEventDetail = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setEditMode(false);
    setEditTitle(event.title);
    setEditDescription(event.description || '');
    const startHour = new Date(event.startTime).getHours();
    setEditHour(startHour.toString());
    const durationHrs = (event.endTime - event.startTime) / 3600000;
    setEditDuration(durationHrs.toString());
    setEditAllDay(event.allDay || false);
    setEditColor(event.color || C.coral);
    setShowDetailModal(true);
    Haptics.selectionAsync();
  }, []);

  const handleDeleteEvent = useCallback((eventId: string) => {
    const doDelete = async () => {
      await deleteCalendarEvent(eventId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDetailModal(false);
      setSelectedEvent(null);
    };

    if (Platform.OS === 'web') {
      doDelete();
    } else {
      Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [deleteCalendarEvent]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedEvent || !editTitle.trim()) return;
    const hour = parseInt(editHour) || 9;
    const duration = parseFloat(editDuration) || 1;
    const start = new Date(selectedEvent.startTime);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + duration * 3600000);

    await deleteCalendarEvent(selectedEvent.id);
    await createCalendarEvent({
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      startTime: start.getTime(),
      endTime: end.getTime(),
      allDay: editAllDay,
      color: editColor,
      source: selectedEvent.source,
      location: selectedEvent.location,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowDetailModal(false);
    setSelectedEvent(null);
    setEditMode(false);
  }, [selectedEvent, editTitle, editDescription, editHour, editDuration, editAllDay, editColor, deleteCalendarEvent, createCalendarEvent]);

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
          style={styles.dayCell}
          onPress={() => {
            setSelectedDate(date);
            Haptics.selectionAsync();
          }}
        >
          {isToday ? (
            <LinearGradient colors={C.gradient.lobster} style={styles.dayCellTodayGradient}>
              <Text style={[styles.dayText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{day}</Text>
            </LinearGradient>
          ) : isSelected ? (
            <View style={styles.dayCellSelectedPill}>
              <Text style={[styles.dayText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{day}</Text>
            </View>
          ) : (
            <Text style={styles.dayText}>{day}</Text>
          )}
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
              style={[styles.weekDay, isSelected && { overflow: 'hidden' as const }]}
              onPress={() => {
                setSelectedDate(date);
                Haptics.selectionAsync();
              }}
            >
              {isSelected && (
                <LinearGradient colors={C.gradient.lobster} style={StyleSheet.absoluteFill} />
              )}
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
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isToday = isSameDay(selectedDate, now);
    return (
      <ScrollView style={styles.dayTimeline} showsVerticalScrollIndicator={false}>
        {hours.map((hour) => {
          const hourEvents = selectedDayEvents.filter((e) => {
            const eHour = new Date(e.startTime).getHours();
            return eHour === hour;
          });
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour % 12 || 12;
          const showNowLine = isToday && currentHour === hour;
          const nowOffset = (currentMinute / 60) * 56;

          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourLabel}>{`${displayHour} ${ampm}`}</Text>
              <View style={styles.hourLine} />
              <View style={styles.hourEvents}>
                {showNowLine && (
                  <View style={[styles.nowIndicator, { top: nowOffset }]}>
                    <View style={styles.nowDot} />
                    <View style={styles.nowLine} />
                  </View>
                )}
                {hourEvents.map((e) => (
                  <Pressable
                    key={e.id}
                    style={[styles.timelineEvent, { backgroundColor: (e.color || C.coral) + '25', borderLeftColor: e.color || C.coral }, C.shadow.card]}
                    onPress={() => openEventDetail(e)}
                    onLongPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      deleteCalendarEvent(e.id);
                    }}
                  >
                    <Text style={[styles.timelineEventTitle, { color: e.color || C.coral }]}>{e.title}</Text>
                    <View style={styles.timelineEventMeta}>
                      <Text style={styles.timelineEventTime}>{formatTime(e.startTime)} - {formatTime(e.endTime)}</Text>
                      <Text style={styles.timelineEventDuration}>{formatDuration(e.startTime, e.endTime)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderDetailModal = () => {
    if (!selectedEvent) return null;
    const eventColor = selectedEvent.color || C.coral;

    return (
      <Modal visible={showDetailModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editMode ? 'Edit Event' : 'Event Details'}</Text>
                <Pressable onPress={() => { setShowDetailModal(false); setEditMode(false); }}>
                  <Ionicons name="close" size={24} color={C.textSecondary} />
                </Pressable>
              </View>

              {editMode ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Event title"
                    placeholderTextColor={C.textTertiary}
                    value={editTitle}
                    onChangeText={setEditTitle}
                  />
                  <TextInput
                    style={[styles.input, { height: 70 }]}
                    placeholder="Description (optional)"
                    placeholderTextColor={C.textTertiary}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    multiline
                  />
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>All Day</Text>
                    <Switch
                      value={editAllDay}
                      onValueChange={setEditAllDay}
                      trackColor={{ false: C.border, true: C.coral + '60' }}
                      thumbColor={editAllDay ? C.coral : C.textTertiary}
                    />
                  </View>
                  {!editAllDay && (
                    <View style={styles.timeRow}>
                      <View style={styles.timeField}>
                        <Text style={styles.timeLabel}>Start Hour</Text>
                        <TextInput
                          style={styles.timeInput}
                          value={editHour}
                          onChangeText={setEditHour}
                          keyboardType="numeric"
                          placeholderTextColor={C.textTertiary}
                        />
                      </View>
                      <View style={styles.timeField}>
                        <Text style={styles.timeLabel}>Duration (hrs)</Text>
                        <TextInput
                          style={styles.timeInput}
                          value={editDuration}
                          onChangeText={setEditDuration}
                          keyboardType="numeric"
                          placeholderTextColor={C.textTertiary}
                        />
                      </View>
                    </View>
                  )}
                  <Text style={[styles.timeLabel, { marginBottom: 8 }]}>Color</Text>
                  <View style={styles.colorPicker}>
                    {EVENT_COLORS.map((color) => (
                      <Pressable
                        key={color}
                        onPress={() => setEditColor(color)}
                        style={[
                          styles.colorOption,
                          { backgroundColor: color },
                          editColor === color && styles.colorOptionSelected,
                        ]}
                      />
                    ))}
                  </View>
                  <Pressable onPress={handleSaveEdit}>
                    <LinearGradient colors={C.gradient.lobster} style={styles.createBtn}>
                      <Text style={styles.createBtnText}>Save Changes</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.detailTitleRow}>
                    <View style={[styles.detailColorDot, { backgroundColor: eventColor }]} />
                    <Text style={[styles.detailTitle, { color: eventColor }]}>{selectedEvent.title}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={18} color={C.textSecondary} />
                    <Text style={styles.detailText}>
                      {selectedEvent.allDay ? 'All Day' : `${formatTime(selectedEvent.startTime)} - ${formatTime(selectedEvent.endTime)}`}
                    </Text>
                  </View>

                  {!selectedEvent.allDay && (
                    <View style={styles.detailRow}>
                      <Ionicons name="hourglass-outline" size={18} color={C.textSecondary} />
                      <Text style={styles.detailText}>{formatDuration(selectedEvent.startTime, selectedEvent.endTime)}</Text>
                    </View>
                  )}

                  {selectedEvent.description ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="document-text-outline" size={18} color={C.textSecondary} />
                      <Text style={styles.detailText}>{selectedEvent.description}</Text>
                    </View>
                  ) : null}

                  {selectedEvent.location ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="location-outline" size={18} color={C.textSecondary} />
                      <Text style={styles.detailText}>{selectedEvent.location}</Text>
                    </View>
                  ) : null}

                  {selectedEvent.source ? (
                    <View style={[styles.detailSourceBadge, { backgroundColor: eventColor + '20' }]}>
                      <Text style={[styles.detailSourceText, { color: eventColor }]}>{selectedEvent.source}</Text>
                    </View>
                  ) : null}

                  <View style={styles.detailActions}>
                    <Pressable
                      style={styles.detailEditBtn}
                      onPress={() => setEditMode(true)}
                    >
                      <Ionicons name="create-outline" size={18} color={C.accent} />
                      <Text style={[styles.detailEditText, { color: C.accent }]}>Edit</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    style={styles.detailDeleteBtn}
                    onPress={() => handleDeleteEvent(selectedEvent.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color={C.error} />
                    <Text style={styles.detailDeleteText}>Delete Event</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPad }]}>
      <LinearGradient colors={[C.gradient.ocean[0], C.gradient.ocean[1], C.background]} style={styles.headerGradient}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="calendar-back">
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Calendar</Text>
          <View style={styles.headerRight}>
            {!isViewingCurrentMonth && (
              <Pressable onPress={jumpToToday} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Today</Text>
              </Pressable>
            )}
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
        </View>
      </LinearGradient>

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

      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Ionicons name="calendar-outline" size={14} color={C.coral} />
          <Text style={styles.summaryText}>{todayEvents.length} today</Text>
        </View>
        {nextUpcomingEvent && (
          <View style={[styles.summaryItem, { flex: 1, marginLeft: 12 }]}>
            <Ionicons name="time-outline" size={14} color={C.coral} />
            <Text style={styles.summaryNextTitle} numberOfLines={1}>{nextUpcomingEvent.title}</Text>
            <Text style={styles.summaryNextTime}>{formatTime(nextUpcomingEvent.startTime)}</Text>
          </View>
        )}
      </View>

      {viewMode === 'month' && (
        <View style={styles.monthNav}>
          <Pressable onPress={() => navigateMonth(-1)}>
            <Ionicons name="chevron-back" size={22} color={C.textSecondary} />
          </Pressable>
          <View style={styles.monthLabelContainer}>
            <Text style={styles.monthLabel}>{MONTHS[currentMonth]} {currentYear}</Text>
          </View>
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
              <LinearGradient colors={[C.coral + '15', C.amber + '10']} style={styles.emptyIconWrap}>
                <Ionicons name="sunny-outline" size={32} color={C.coral} />
              </LinearGradient>
              <Text style={styles.emptyDayTitle}>Nothing scheduled</Text>
              <Text style={styles.emptyDayText}>Enjoy your free time or plan something new</Text>
              <Pressable
                onPress={() => setShowAddModal(true)}
                style={styles.emptyAddBtn}
              >
                <LinearGradient colors={C.gradient.lobster} style={styles.emptyAddGradient}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.emptyAddText}>Add Event</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            selectedDayEvents.map((event) => (
              <Pressable
                key={event.id}
                style={[styles.eventCard, C.shadow.card]}
                onPress={() => openEventDetail(event)}
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

      {renderDetailModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  headerGradient: { paddingBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: C.text },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.coral + '20', borderRadius: 14 },
  todayBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: C.coral },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  viewToggle: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.card, borderRadius: 10, padding: 3, marginBottom: 12 },
  viewToggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  viewToggleBtnActive: { backgroundColor: C.coral + '20' },
  viewToggleText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.textSecondary },
  viewToggleTextActive: { color: C.coral },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8, paddingVertical: 6, marginHorizontal: 16, backgroundColor: C.card + '80', borderRadius: 10 },
  monthLabelContainer: { alignItems: 'center' },
  monthLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: C.text },
  monthGrid: { paddingHorizontal: 12 },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: { flex: 1, textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textTertiary, paddingVertical: 6 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayCellSelected: { backgroundColor: C.coral + '20', borderRadius: 12 },
  dayCellTodayGradient: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayCellSelectedPill: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.text },
  dayTextSelected: { color: '#fff', fontFamily: 'Inter_700Bold' },
  eventDots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },
  weekView: { paddingHorizontal: 12, marginBottom: 8 },
  weekStrip: { flexDirection: 'row', gap: 4 },
  weekDay: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: C.card },
  weekDaySelected: { },
  weekDayName: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary, marginBottom: 4 },
  weekDayNum: { fontFamily: 'Inter_700Bold', fontSize: 16, color: C.text },
  weekDayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  selectedDateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  selectedDateText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: C.text },
  eventCount: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary },
  eventsList: { flex: 1, paddingHorizontal: 16 },
  emptyDay: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyDayTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: C.text },
  emptyDayText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: C.textTertiary, textAlign: 'center' },
  emptyAddBtn: { marginTop: 8, borderRadius: 20, overflow: 'hidden' },
  emptyAddGradient: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10 },
  emptyAddText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#fff' },
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
  timelineEvent: { borderLeftWidth: 3, borderRadius: 8, padding: 12, marginBottom: 6 },
  timelineEventTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  timelineEventMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  timelineEventTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.textTertiary },
  timelineEventDuration: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.textSecondary, backgroundColor: C.card, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  nowIndicator: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B6B' },
  nowLine: { flex: 1, height: 2, backgroundColor: '#FF6B6B' },
  summaryBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.borderLight, paddingHorizontal: 12, paddingVertical: 10 },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.textSecondary },
  summaryNextTitle: { fontFamily: 'Inter_500Medium', fontSize: 12, color: C.text, flex: 1 },
  summaryNextTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.coral },
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
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
  colorPicker: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  colorOption: { width: 36, height: 36, borderRadius: 18 },
  colorOptionSelected: { borderWidth: 3, borderColor: '#fff' },
  detailTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  detailColorDot: { width: 12, height: 12, borderRadius: 6 },
  detailTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, flex: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14, paddingVertical: 4 },
  detailText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: C.textSecondary, flex: 1, lineHeight: 20 },
  detailSourceBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 16 },
  detailSourceText: { fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'capitalize' },
  detailActions: { marginTop: 8, marginBottom: 16 },
  detailEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentMuted, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignSelf: 'flex-start' },
  detailEditText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  detailDeleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.borderLight, marginTop: 4 },
  detailDeleteText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: C.error },
});
