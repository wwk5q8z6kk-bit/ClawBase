import type { InboxItem } from './types';

interface ParsedItem {
  rawText: string;
  parsedTitle: string;
  parsedCategory: 'task' | 'event' | 'note';
  parsedPriority: 'low' | 'medium' | 'high' | 'urgent';
  parsedDueDate?: number;
}

const EVENT_KEYWORDS = [
  'meeting', 'call with', 'appointment', 'lunch with', 'dinner with',
  'coffee with', 'interview', 'standup', 'sync with', 'catch up with',
  'conference', 'workshop', 'webinar', 'presentation',
];

const NOTE_KEYWORDS = [
  'remember', 'idea', 'note', 'thought', 'maybe', 'consider',
  'look into', 'research', 'think about', 'explore',
];

const URGENT_KEYWORDS = ['urgent', 'asap', 'immediately', 'critical', 'emergency'];
const HIGH_KEYWORDS = ['important', 'high priority', 'must', 'need to', 'have to', 'crucial'];
const LOW_KEYWORDS = ['when i get a chance', 'whenever', 'low priority', 'someday', 'eventually', 'no rush'];

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function getNextDayOfWeek(dayIndex: number): Date {
  const now = new Date();
  const current = now.getDay();
  let daysAhead = dayIndex - current;
  if (daysAhead <= 0) daysAhead += 7;
  const result = new Date(now);
  result.setDate(result.getDate() + daysAhead);
  result.setHours(9, 0, 0, 0);
  return result;
}

function extractDateFromText(text: string): { date: number | undefined; cleanText: string } {
  const lower = text.toLowerCase();
  let cleanText = text;

  const todayMatch = lower.match(/\b(today)\b/);
  if (todayMatch) {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    cleanText = cleanText.replace(/\btoday\b/i, '').trim();
    return { date: d.getTime(), cleanText };
  }

  const tonightMatch = lower.match(/\b(tonight)\b/);
  if (tonightMatch) {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    cleanText = cleanText.replace(/\btonight\b/i, '').trim();
    return { date: d.getTime(), cleanText };
  }

  const tomorrowMatch = lower.match(/\b(tomorrow)\b/);
  if (tomorrowMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    cleanText = cleanText.replace(/\btomorrow\b/i, '').trim();
    return { date: d.getTime(), cleanText };
  }

  const nextWeekMatch = lower.match(/\b(next week)\b/);
  if (nextWeekMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    cleanText = cleanText.replace(/\bnext week\b/i, '').trim();
    return { date: d.getTime(), cleanText };
  }

  const nextMonthMatch = lower.match(/\b(next month)\b/);
  if (nextMonthMatch) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setHours(9, 0, 0, 0);
    cleanText = cleanText.replace(/\bnext month\b/i, '').trim();
    return { date: d.getTime(), cleanText };
  }

  const byDayMatch = lower.match(/\b(?:by|on|this|next)\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i);
  if (byDayMatch) {
    const dayKey = byDayMatch[1].toLowerCase();
    const dayIdx = DAY_NAMES[dayKey];
    if (dayIdx !== undefined) {
      const isNext = lower.includes('next ' + dayKey);
      const d = getNextDayOfWeek(dayIdx);
      if (isNext) d.setDate(d.getDate() + 7);
      cleanText = cleanText.replace(new RegExp('\\b(?:by|on|this|next)\\s+' + byDayMatch[1] + '\\b', 'i'), '').trim();
      return { date: d.getTime(), cleanText };
    }
  }

  const standaloneDayMatch = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (standaloneDayMatch) {
    const dayKey = standaloneDayMatch[1].toLowerCase();
    const dayIdx = DAY_NAMES[dayKey];
    if (dayIdx !== undefined) {
      const d = getNextDayOfWeek(dayIdx);
      cleanText = cleanText.replace(new RegExp('\\b' + standaloneDayMatch[1] + '\\b', 'i'), '').trim();
      return { date: d.getTime(), cleanText };
    }
  }

  const byMonthDayMatch = lower.match(/\b(?:by|on|before)\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (byMonthDayMatch) {
    const monthKey = byMonthDayMatch[1].toLowerCase();
    const month = MONTH_NAMES[monthKey];
    const day = parseInt(byMonthDayMatch[2], 10);
    if (month !== undefined && day >= 1 && day <= 31) {
      const now = new Date();
      const d = new Date(now.getFullYear(), month, day, 9, 0, 0);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      cleanText = cleanText.replace(new RegExp('\\b(?:by|on|before)\\s+' + byMonthDayMatch[1] + '\\s+' + byMonthDayMatch[2] + '(?:st|nd|rd|th)?\\b', 'i'), '').trim();
      return { date: d.getTime(), cleanText };
    }
  }

  const monthDayMatch = lower.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDayMatch) {
    const monthKey = monthDayMatch[1].toLowerCase();
    const month = MONTH_NAMES[monthKey];
    const day = parseInt(monthDayMatch[2], 10);
    if (month !== undefined && day >= 1 && day <= 31) {
      const now = new Date();
      const d = new Date(now.getFullYear(), month, day, 9, 0, 0);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      cleanText = cleanText.replace(new RegExp('\\b' + monthDayMatch[1] + '\\s+' + monthDayMatch[2] + '(?:st|nd|rd|th)?\\b', 'i'), '').trim();
      return { date: d.getTime(), cleanText };
    }
  }

  const timeMatch = lower.match(/\b(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const d = new Date();
    d.setHours(hour, min, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    cleanText = cleanText.replace(new RegExp('\\b(?:at|by)\\s+' + timeMatch[1] + '(?::' + (timeMatch[2] || '') + ')?\\s*' + (timeMatch[3] || '') + '\\b', 'i'), '').trim();
    return { date: d.getTime(), cleanText };
  }

  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    cleanText = cleanText.replace(/\bin\s+\d+\s+days?\b/i, '').trim();
    return { date: d.getTime(), cleanText };
  }

  return { date: undefined, cleanText };
}

function detectPriority(text: string): 'low' | 'medium' | 'high' | 'urgent' {
  const lower = text.toLowerCase();

  for (const kw of URGENT_KEYWORDS) {
    if (lower.includes(kw)) return 'urgent';
  }
  for (const kw of HIGH_KEYWORDS) {
    if (lower.includes(kw)) return 'high';
  }
  for (const kw of LOW_KEYWORDS) {
    if (lower.includes(kw)) return 'low';
  }

  if (lower.includes('!') || lower.includes('!!!')) return 'high';

  return 'medium';
}

function detectCategory(text: string): 'task' | 'event' | 'note' {
  const lower = text.toLowerCase();

  for (const kw of EVENT_KEYWORDS) {
    if (lower.includes(kw)) return 'event';
  }
  for (const kw of NOTE_KEYWORDS) {
    if (lower.includes(kw)) return 'note';
  }

  const taskVerbs = ['buy', 'get', 'finish', 'complete', 'send', 'email', 'submit',
    'fix', 'update', 'review', 'prepare', 'schedule', 'book', 'order',
    'pick up', 'drop off', 'return', 'pay', 'cancel', 'renew', 'sign up',
    'set up', 'install', 'clean', 'organize', 'write', 'create', 'make',
    'call', 'text', 'check', 'follow up', 'respond'];

  for (const verb of taskVerbs) {
    if (lower.startsWith(verb) || lower.includes(' ' + verb + ' ')) return 'task';
  }

  return 'task';
}

function cleanTitle(text: string): string {
  let cleaned = text
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const priorityWords = [...URGENT_KEYWORDS, ...HIGH_KEYWORDS, ...LOW_KEYWORDS];
  for (const pw of priorityWords) {
    cleaned = cleaned.replace(new RegExp('\\b' + pw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '').trim();
  }

  cleaned = cleaned.replace(/^[,.\-;:!]+\s*/, '').replace(/[,.\-;:!]+\s*$/, '').trim();

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

export function splitBrainDump(rawText: string): string[] {
  const items: string[] = [];

  const lines = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    const bulletSplit = line.split(/(?:^|\s)[-*•]\s+/).filter(s => s.trim().length > 0);
    if (bulletSplit.length > 1) {
      items.push(...bulletSplit.map(s => s.trim()));
      continue;
    }

    const numberedSplit = line.split(/\d+[.)]\s+/).filter(s => s.trim().length > 0);
    if (numberedSplit.length > 1) {
      items.push(...numberedSplit.map(s => s.trim()));
      continue;
    }

    const semicolonParts = line.split(/;\s*/).filter(s => s.trim().length > 0);
    if (semicolonParts.length > 1) {
      items.push(...semicolonParts.map(s => s.trim()));
      continue;
    }

    const sentenceParts = line.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 0);
    if (sentenceParts.length > 1) {
      items.push(...sentenceParts.map(s => s.trim()));
      continue;
    }

    const connectorPattern = /\b(?:and also|and then|also need to|then|also)\b/i;
    if (connectorPattern.test(line)) {
      const parts = line.split(connectorPattern).filter(s => s.trim().length > 0);
      if (parts.length > 1) {
        items.push(...parts.map(s => s.trim()));
        continue;
      }
    }

    const commaPattern = /,\s*/;
    const commaParts = line.split(commaPattern).filter(s => s.trim().length > 0);
    if (commaParts.length >= 3) {
      const looksLikeList = commaParts.every(p => p.split(/\s+/).length <= 8);
      if (looksLikeList) {
        items.push(...commaParts.map(s => s.trim()));
        continue;
      }
    }

    items.push(line);
  }

  return items.filter(item => item.length > 1);
}

export function parseItem(rawText: string): ParsedItem {
  const { date, cleanText } = extractDateFromText(rawText);
  const priority = detectPriority(rawText);
  const category = detectCategory(rawText);
  const title = cleanTitle(cleanText);

  return {
    rawText,
    parsedTitle: title || rawText.trim(),
    parsedCategory: category,
    parsedPriority: priority,
    parsedDueDate: date,
  };
}

export function parseBrainDump(rawText: string): ParsedItem[] {
  const items = splitBrainDump(rawText);
  return items.map(parseItem);
}

export function getCategoryIcon(category: 'task' | 'event' | 'note'): string {
  switch (category) {
    case 'task': return 'checkmark-circle-outline';
    case 'event': return 'calendar-outline';
    case 'note': return 'document-text-outline';
  }
}

export function getCategoryColor(category: 'task' | 'event' | 'note', colors: { amber: string; accent: string; purple: string }): string {
  switch (category) {
    case 'task': return colors.amber;
    case 'event': return colors.accent;
    case 'note': return colors.purple;
  }
}

export function getPriorityLabel(priority: 'low' | 'medium' | 'high' | 'urgent'): string {
  switch (priority) {
    case 'urgent': return 'Urgent';
    case 'high': return 'High';
    case 'medium': return 'Med';
    case 'low': return 'Low';
  }
}

export function formatParsedDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diffDays > 0 && diffDays <= 7) return days[d.getDay()];

  return `${months[d.getMonth()]} ${d.getDate()}`;
}
