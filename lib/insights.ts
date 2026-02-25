import type { Task, MemoryEntry, CalendarEvent, CRMContact } from './types';

export type InsightPriority = 'P1' | 'P2' | 'P3';
export type InsightCategory = 'tasks' | 'contacts' | 'memory' | 'calendar' | 'streak';

export interface Insight {
  id: string;
  type: string;
  priority: InsightPriority;
  title: string;
  message: string;
  actionLabel: string;
  actionRoute: string;
  icon: string;
  category: InsightCategory;
}

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function daysAgo(ms: number): number {
  return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
}

function getOverdueTasks(tasks: Task[]): Insight[] {
  const now = Date.now();
  const overdue = tasks.filter(
    (t) =>
      t.dueDate &&
      t.dueDate < now &&
      t.status !== 'done' &&
      t.status !== 'archived',
  );

  if (overdue.length === 0) return [];

  const priority: InsightPriority = overdue.length >= 3 ? 'P1' : 'P2';
  const oldest = overdue.reduce((a, b) =>
    (a.dueDate || 0) < (b.dueDate || 0) ? a : b,
  );
  const oldestDays = daysAgo(oldest.dueDate!);

  return [
    {
      id: 'insight-overdue-tasks',
      type: 'overdue_tasks',
      priority,
      title: `${overdue.length} Overdue Task${overdue.length > 1 ? 's' : ''}`,
      message:
        overdue.length === 1
          ? `"${overdue[0].title}" is past due`
          : `Oldest is ${oldestDays} day${oldestDays !== 1 ? 's' : ''} overdue`,
      actionLabel: 'View Tasks',
      actionRoute: '/(tabs)/vault',
      icon: 'alert-circle',
      category: 'tasks',
    },
  ];
}

function getDueTodayTasks(tasks: Task[]): Insight[] {
  const now = new Date();
  const dayEnd = endOfDay(now);
  const dayStart = startOfDay(now);

  const dueToday = tasks.filter(
    (t) =>
      t.dueDate &&
      t.dueDate >= dayStart &&
      t.dueDate <= dayEnd &&
      t.status !== 'done' &&
      t.status !== 'archived',
  );

  if (dueToday.length === 0) return [];

  const priority: InsightPriority = dueToday.length >= 3 ? 'P1' : 'P2';

  return [
    {
      id: 'insight-due-today',
      type: 'due_today',
      priority,
      title: `${dueToday.length} Task${dueToday.length > 1 ? 's' : ''} Due Today`,
      message: dueToday.map((t) => t.title).slice(0, 2).join(', ') +
        (dueToday.length > 2 ? ` +${dueToday.length - 2} more` : ''),
      actionLabel: 'View Tasks',
      actionRoute: '/(tabs)/vault',
      icon: 'time',
      category: 'tasks',
    },
  ];
}

function getStaleContacts(contacts: CRMContact[]): Insight[] {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const stale = contacts.filter(
    (c) =>
      c.stage !== 'archived' &&
      c.lastInteraction &&
      Date.now() - c.lastInteraction > sevenDaysMs,
  );

  if (stale.length === 0) return [];

  const mostStale = stale.reduce((a, b) =>
    (a.lastInteraction || 0) < (b.lastInteraction || 0) ? a : b,
  );
  const staleDays = daysAgo(mostStale.lastInteraction!);

  return [
    {
      id: 'insight-stale-contacts',
      type: 'stale_contacts',
      priority: 'P2',
      title: `${stale.length} Contact${stale.length > 1 ? 's' : ''} Need Attention`,
      message: `${mostStale.name} — last contact ${staleDays} days ago`,
      actionLabel: 'View Contacts',
      actionRoute: '/crm',
      icon: 'people',
      category: 'contacts',
    },
  ];
}

function getUnreviewedMemory(entries: MemoryEntry[]): Insight[] {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const unreviewed = entries.filter(
    (m) =>
      m.reviewStatus === 'unread' &&
      Date.now() - m.timestamp > oneDayMs,
  );

  if (unreviewed.length === 0) return [];

  return [
    {
      id: 'insight-unreviewed-memory',
      type: 'unreviewed_memory',
      priority: 'P3',
      title: `${unreviewed.length} Unreviewed Item${unreviewed.length > 1 ? 's' : ''}`,
      message: 'Knowledge items waiting for your review',
      actionLabel: 'Review',
      actionRoute: '/(tabs)/vault',
      icon: 'book',
      category: 'memory',
    },
  ];
}

function getBusyDay(events: CalendarEvent[]): Insight[] {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const todayEvents = events.filter(
    (e) => e.startTime >= dayStart && e.startTime <= dayEnd,
  );

  if (todayEvents.length < 3) return [];

  return [
    {
      id: 'insight-busy-day',
      type: 'busy_day',
      priority: 'P2',
      title: 'Busy Day Ahead',
      message: `${todayEvents.length} events scheduled today`,
      actionLabel: 'View Calendar',
      actionRoute: '/(tabs)/calendar',
      icon: 'calendar',
      category: 'calendar',
    },
  ];
}

function getTaskStreak(tasks: Task[]): Insight[] {
  const completedTasks = tasks.filter((t) => t.status === 'done' && t.updatedAt);
  if (completedTasks.length === 0) return [];

  const completionDays = new Set(
    completedTasks.map((t) => {
      const d = new Date(t.updatedAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (completionDays.has(key)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  if (streak < 2) return [];

  return [
    {
      id: 'insight-task-streak',
      type: 'task_streak',
      priority: 'P3',
      title: `${streak}-Day Streak`,
      message: `You've completed tasks ${streak} days in a row`,
      actionLabel: 'Keep Going',
      actionRoute: '/(tabs)/vault',
      icon: 'flame',
      category: 'streak',
    },
  ];
}

const PRIORITY_ORDER: Record<InsightPriority, number> = { P1: 0, P2: 1, P3: 2 };

export function generateInsights(data: {
  tasks: Task[];
  memoryEntries: MemoryEntry[];
  calendarEvents: CalendarEvent[];
  crmContacts: CRMContact[];
}): Insight[] {
  const all: Insight[] = [
    ...getOverdueTasks(data.tasks),
    ...getDueTodayTasks(data.tasks),
    ...getStaleContacts(data.crmContacts),
    ...getUnreviewedMemory(data.memoryEntries),
    ...getBusyDay(data.calendarEvents),
    ...getTaskStreak(data.tasks),
  ];

  return all.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
