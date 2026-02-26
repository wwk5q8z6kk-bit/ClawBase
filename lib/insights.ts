import type { Task, MemoryEntry, CalendarEvent, CRMContact } from './types';
import type { EntityLink } from './entityLinks';

export type InsightPriority = 'P1' | 'P2' | 'P3';
export type InsightCategory = 'tasks' | 'contacts' | 'memory' | 'calendar' | 'streak' | 'cross_entity';

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

function getMeetingPrep(events: CalendarEvent[], contacts: CRMContact[], tasks: Task[], links: EntityLink[]): Insight[] {
  const now = new Date();
  const dayEnd = endOfDay(now);

  const upcomingMeetings = events.filter(
    (e) => e.startTime >= now.getTime() && e.startTime <= dayEnd && e.attendees && e.attendees.length > 0,
  );

  if (upcomingMeetings.length === 0) return [];

  const soonest = upcomingMeetings.reduce((a, b) => a.startTime < b.startTime ? a : b);

  const eventLinks = links.filter(
    (l) => (l.sourceType === 'calendar' && l.sourceId === soonest.id) ||
           (l.targetType === 'calendar' && l.targetId === soonest.id),
  );

  const linkedContactIds = new Set<string>();
  const linkedTaskIds = new Set<string>();
  for (const link of eventLinks) {
    const otherType = link.sourceType === 'calendar' ? link.targetType : link.sourceType;
    const otherId = link.sourceType === 'calendar' ? link.targetId : link.sourceId;
    if (otherType === 'contact') linkedContactIds.add(otherId);
    if (otherType === 'task') linkedTaskIds.add(otherId);
  }

  const parts: string[] = [];
  if (linkedContactIds.size > 0) {
    const names = contacts.filter(c => linkedContactIds.has(c.id)).map(c => c.name.split(' ')[0]);
    if (names.length > 0) parts.push(`with ${names.slice(0, 2).join(', ')}`);
  }
  if (linkedTaskIds.size > 0) {
    parts.push(`${linkedTaskIds.size} related task${linkedTaskIds.size > 1 ? 's' : ''}`);
  }

  const hours = new Date(soonest.startTime).getHours();
  const mins = new Date(soonest.startTime).getMinutes();
  const timeStr = `${hours % 12 || 12}:${mins.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;

  return [
    {
      id: 'insight-meeting-prep',
      type: 'meeting_prep',
      priority: 'P2',
      title: `Prep: ${soonest.title}`,
      message: `At ${timeStr}${parts.length > 0 ? ' — ' + parts.join(', ') : ''}`,
      actionLabel: 'View Event',
      actionRoute: '/(tabs)/calendar',
      icon: 'briefcase',
      category: 'cross_entity',
    },
  ];
}

function getBlockedTasks(tasks: Task[]): Insight[] {
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const blocked = tasks.filter(
    (t) =>
      t.status === 'in_progress' &&
      t.updatedAt &&
      Date.now() - t.updatedAt > threeDaysMs,
  );

  if (blocked.length === 0) return [];

  const oldest = blocked.reduce((a, b) => a.updatedAt < b.updatedAt ? a : b);
  const stuckDays = daysAgo(oldest.updatedAt);

  return [
    {
      id: 'insight-blocked-tasks',
      type: 'blocked_tasks',
      priority: blocked.length >= 2 ? 'P1' : 'P2',
      title: `${blocked.length} Task${blocked.length > 1 ? 's' : ''} May Be Stuck`,
      message: `"${oldest.title}" — no updates for ${stuckDays} day${stuckDays !== 1 ? 's' : ''}`,
      actionLabel: 'Review',
      actionRoute: '/(tabs)/vault',
      icon: 'pause-circle',
      category: 'tasks',
    },
  ];
}

function getHighValueFollowUp(contacts: CRMContact[], events: CalendarEvent[], links: EntityLink[]): Insight[] {
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

  const recentMeetingContactIds = new Set<string>();
  const recentEvents = events.filter(e => Date.now() - e.endTime < twoDaysMs && e.endTime < Date.now());

  for (const event of recentEvents) {
    const eventLinks = links.filter(
      (l) => (l.sourceType === 'calendar' && l.sourceId === event.id) ||
             (l.targetType === 'calendar' && l.targetId === event.id),
    );
    for (const link of eventLinks) {
      const otherType = link.sourceType === 'calendar' ? link.targetType : link.sourceType;
      const otherId = link.sourceType === 'calendar' ? link.targetId : link.sourceId;
      if (otherType === 'contact') recentMeetingContactIds.add(otherId);
    }
  }

  const needsFollowUp = contacts.filter(
    c => recentMeetingContactIds.has(c.id) &&
         c.stage !== 'archived' &&
         (!c.lastInteraction || Date.now() - c.lastInteraction > twoDaysMs),
  );

  if (needsFollowUp.length === 0) return [];

  return [
    {
      id: 'insight-follow-up',
      type: 'follow_up',
      priority: 'P2',
      title: 'Follow Up Needed',
      message: `${needsFollowUp[0].name} — you met recently but haven't followed up`,
      actionLabel: 'View Contact',
      actionRoute: '/crm',
      icon: 'arrow-redo',
      category: 'cross_entity',
    },
  ];
}

function getResourceConflicts(tasks: Task[], events: CalendarEvent[]): Insight[] {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const todayEvents = events.filter(e => e.startTime >= dayStart && e.startTime <= dayEnd);
  if (todayEvents.length < 3) return [];

  const dueTodayTasks = tasks.filter(
    t => t.dueDate && t.dueDate >= dayStart && t.dueDate <= dayEnd &&
         t.status !== 'done' && t.status !== 'archived',
  );
  if (dueTodayTasks.length === 0) return [];

  const totalMeetingMinutes = todayEvents.reduce((sum, e) => sum + (e.endTime - e.startTime) / 60000, 0);
  const busyHours = Math.round(totalMeetingMinutes / 60);

  return [
    {
      id: 'insight-resource-conflict',
      type: 'resource_conflict',
      priority: dueTodayTasks.length >= 2 ? 'P1' : 'P2',
      title: 'Deadline vs Meeting Crunch',
      message: `${dueTodayTasks.length} task${dueTodayTasks.length > 1 ? 's' : ''} due today with ${busyHours}h of meetings booked`,
      actionLabel: 'View Calendar',
      actionRoute: '/(tabs)/calendar',
      icon: 'warning',
      category: 'cross_entity',
    },
  ];
}

function getContextualMemory(events: CalendarEvent[], memories: MemoryEntry[], links: EntityLink[]): Insight[] {
  const now = Date.now();
  const twoHoursMs = 2 * 60 * 60 * 1000;

  const upcoming = events.filter(e => e.startTime > now && e.startTime - now <= twoHoursMs);
  if (upcoming.length === 0) return [];

  const soonest = upcoming.reduce((a, b) => a.startTime < b.startTime ? a : b);

  const eventLinks = links.filter(
    l => (l.sourceType === 'calendar' && l.sourceId === soonest.id) ||
         (l.targetType === 'calendar' && l.targetId === soonest.id),
  );

  const linkedMemoryIds = new Set<string>();
  for (const link of eventLinks) {
    const otherType = link.sourceType === 'calendar' ? link.targetType : link.sourceType;
    const otherId = link.sourceType === 'calendar' ? link.targetId : link.sourceId;
    if (otherType === 'memory') linkedMemoryIds.add(otherId);
  }

  const titleWords = soonest.title.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
  const keywordMatches = memories.filter(m => {
    if (linkedMemoryIds.has(m.id)) return false;
    const text = (m.title + ' ' + m.content).toLowerCase();
    const matched = titleWords.filter(w => text.includes(w)).length;
    return matched >= 2;
  });

  const relatedCount = linkedMemoryIds.size + keywordMatches.length;
  if (relatedCount === 0) return [];

  const minsUntil = Math.round((soonest.startTime - now) / 60000);

  return [
    {
      id: 'insight-contextual-memory',
      type: 'contextual_memory',
      priority: 'P2',
      title: `Notes for ${soonest.title}`,
      message: `${relatedCount} related note${relatedCount > 1 ? 's' : ''} found — meeting in ${minsUntil}m`,
      actionLabel: 'Review Notes',
      actionRoute: '/(tabs)/vault',
      icon: 'document-text',
      category: 'cross_entity',
    },
  ];
}

function getContactProjectStall(contacts: CRMContact[], tasks: Task[], links: EntityLink[]): Insight[] {
  const results: Insight[] = [];

  for (const contact of contacts) {
    if (contact.stage === 'archived') continue;

    const contactLinks = links.filter(
      l => (l.sourceType === 'contact' && l.sourceId === contact.id) ||
           (l.targetType === 'contact' && l.targetId === contact.id),
    );

    const linkedTaskIds = new Set<string>();
    for (const link of contactLinks) {
      const otherType = link.sourceType === 'contact' ? link.targetType : link.sourceType;
      const otherId = link.sourceType === 'contact' ? link.targetId : link.sourceId;
      if (otherType === 'task') linkedTaskIds.add(otherId);
    }

    if (linkedTaskIds.size === 0) continue;

    const linkedTasks = tasks.filter(t => linkedTaskIds.has(t.id));
    const overdue = linkedTasks.filter(
      t => t.dueDate && t.dueDate < Date.now() && t.status !== 'done' && t.status !== 'archived',
    );

    if (overdue.length >= 2) {
      results.push({
        id: `insight-contact-stall-${contact.id}`,
        type: 'contact_project_stall',
        priority: 'P2',
        title: `${contact.name} — Progress Stalled`,
        message: `${overdue.length} linked tasks are overdue`,
        actionLabel: 'View Contact',
        actionRoute: '/crm',
        icon: 'person-circle',
        category: 'cross_entity',
      });
      if (results.length >= 2) break;
    }
  }

  return results;
}

function getPostMeetingActions(events: CalendarEvent[], tasks: Task[], memories: MemoryEntry[], links: EntityLink[]): Insight[] {
  const now = Date.now();
  const fourHoursMs = 4 * 60 * 60 * 1000;

  const recentlyEnded = events.filter(
    e => e.endTime < now && now - e.endTime < fourHoursMs && e.endTime > now - fourHoursMs,
  );

  for (const event of recentlyEnded) {
    const eventLinks = links.filter(
      l => (l.sourceType === 'calendar' && l.sourceId === event.id) ||
           (l.targetType === 'calendar' && l.targetId === event.id),
    );

    const hasPostMeetingContent = eventLinks.some(link => {
      const otherType = link.sourceType === 'calendar' ? link.targetType : link.sourceType;
      return (otherType === 'task' || otherType === 'memory') && link.createdAt > event.startTime;
    });

    const hasRecentTask = tasks.some(t => t.createdAt > event.startTime && t.createdAt < now && now - t.createdAt < fourHoursMs);
    const hasRecentMem = memories.some(m => m.timestamp > event.startTime && m.timestamp < now && now - m.timestamp < fourHoursMs);

    if (!hasPostMeetingContent && !hasRecentTask && !hasRecentMem) {
      const minsAgo = Math.round((now - event.endTime) / 60000);
      return [
        {
          id: `insight-post-meeting-${event.id}`,
          type: 'post_meeting',
          priority: 'P3',
          title: `Log Action Items?`,
          message: `"${event.title}" ended ${minsAgo}m ago — no follow-up notes yet`,
          actionLabel: 'Add Notes',
          actionRoute: '/(tabs)/vault',
          icon: 'create',
          category: 'cross_entity',
        },
      ];
    }
  }

  return [];
}

const PRIORITY_ORDER: Record<InsightPriority, number> = { P1: 0, P2: 1, P3: 2 };

export function generateInsights(data: {
  tasks: Task[];
  memoryEntries: MemoryEntry[];
  calendarEvents: CalendarEvent[];
  crmContacts: CRMContact[];
  entityLinks?: EntityLink[];
}): Insight[] {
  const links = data.entityLinks || [];
  const all: Insight[] = [
    ...getOverdueTasks(data.tasks),
    ...getDueTodayTasks(data.tasks),
    ...getBlockedTasks(data.tasks),
    ...getStaleContacts(data.crmContacts),
    ...getUnreviewedMemory(data.memoryEntries),
    ...getBusyDay(data.calendarEvents),
    ...getTaskStreak(data.tasks),
    ...getMeetingPrep(data.calendarEvents, data.crmContacts, data.tasks, links),
    ...getHighValueFollowUp(data.crmContacts, data.calendarEvents, links),
    ...getResourceConflicts(data.tasks, data.calendarEvents),
    ...getContextualMemory(data.calendarEvents, data.memoryEntries, links),
    ...getContactProjectStall(data.crmContacts, data.tasks, links),
    ...getPostMeetingActions(data.calendarEvents, data.tasks, data.memoryEntries, links),
  ];

  return all.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
