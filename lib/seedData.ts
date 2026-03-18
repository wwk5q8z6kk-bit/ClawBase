import type { Task, CalendarEvent, CRMContact, MemoryEntry } from './types';

function hoursFromNow(h: number) {
  return Date.now() + h * 3600000;
}

function daysAgo(d: number) {
  return Date.now() - d * 86400000;
}

function todayAt(hour: number, min = 0) {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d.getTime();
}

export function generateSeedTasks(): Omit<Task, 'id'>[] {
  return [
    { title: 'Review Q4 financial projections', status: 'in_progress', priority: 'high', createdAt: daysAgo(2), updatedAt: daysAgo(0.1), dueDate: hoursFromNow(48), tags: ['finance', 'quarterly', 'from:linear'], source: 'linear', assignee: 'Sarah K.' },
    { title: 'Deploy auth microservice update', status: 'todo', priority: 'urgent', createdAt: daysAgo(1), updatedAt: daysAgo(0.5), dueDate: hoursFromNow(8), tags: ['engineering', 'deploy', 'from:github'], source: 'github' },
    { title: 'Dentist appointment follow-up', status: 'deferred', priority: 'low', createdAt: daysAgo(5), updatedAt: daysAgo(1), tags: ['personal', 'health', 'from:manual'], source: 'manual' },
    { title: 'Send investor update email', status: 'done', priority: 'high', createdAt: daysAgo(3), updatedAt: daysAgo(0.2), tags: ['investors', 'from:manual'], source: 'manual' },
    { title: 'Design new landing page wireframes', status: 'in_progress', priority: 'medium', createdAt: daysAgo(1), updatedAt: daysAgo(0.3), tags: ['design', 'marketing', 'from:manual'], source: 'manual', assignee: 'Alex M.' },
    { title: 'Update API rate limiting config', status: 'todo', priority: 'medium', createdAt: daysAgo(0.5), updatedAt: daysAgo(0.5), tags: ['engineering', 'from:github'], source: 'github' },
    { title: 'Prepare board meeting slides', status: 'todo', priority: 'high', createdAt: daysAgo(1), updatedAt: daysAgo(0.8), dueDate: hoursFromNow(72), tags: ['board', 'presentation', 'from:manual'], source: 'manual' },
    { title: 'Archive old support tickets', status: 'archived', priority: 'low', createdAt: daysAgo(10), updatedAt: daysAgo(3), tags: ['support', 'from:manual'], source: 'manual' },
    { title: 'Review PR #247 - caching layer', status: 'todo', priority: 'medium', createdAt: daysAgo(0.2), updatedAt: daysAgo(0.2), source: 'github', tags: ['engineering', 'review', 'from:github'] },
    { title: 'Weekly team retro notes', status: 'done', priority: 'medium', createdAt: daysAgo(2), updatedAt: daysAgo(1.5), tags: ['team', 'from:manual'], source: 'manual' },
  ];
}

export function generateSeedEvents(): Omit<CalendarEvent, 'id'>[] {
  return [
    { title: 'Standup', startTime: todayAt(9, 0), endTime: todayAt(9, 15), color: '#10B981', source: 'google', recurring: true, tags: ['from:google'] },
    { title: 'Design Review', startTime: todayAt(10, 30), endTime: todayAt(11, 30), color: '#4F6BF6', source: 'google', attendees: ['Alex M.', 'Jordan L.'], tags: ['from:google'] },
    { title: 'Lunch with Marcus', startTime: todayAt(12, 0), endTime: todayAt(13, 0), color: '#E8A951', source: 'manual', location: 'Sushi Palace', tags: ['from:manual'] },
    { title: 'Investor Call', startTime: todayAt(14, 0), endTime: todayAt(15, 0), color: '#FFB020', source: 'google', description: 'Q4 review with Acme Ventures', attendees: ['Pat R.', 'Sam T.'], tags: ['from:google'] },
    { title: 'Focus Time', startTime: todayAt(15, 30), endTime: todayAt(17, 0), color: '#8B5CF6', source: 'google', tags: ['from:google'] },
    { title: 'Board Meeting Prep', startTime: todayAt(8, 0) + 86400000, endTime: todayAt(9, 0) + 86400000, color: '#4F6BF6', source: 'google', tags: ['from:google'] },
    { title: 'Dentist', startTime: todayAt(11, 0) + 2 * 86400000, endTime: todayAt(12, 0) + 2 * 86400000, color: '#FF9F5A', source: 'apple', location: 'Downtown Dental', tags: ['from:apple'] },
  ];
}

export function generateSeedContacts(): Omit<CRMContact, 'id' | 'createdAt' | 'interactions'>[] {
  return [
    { name: 'Marcus Chen', email: 'marcus@acmevc.com', company: 'Acme Ventures', role: 'Partner', stage: 'customer', lastInteraction: daysAgo(0.5) },
    { name: 'Sarah Kim', email: 'sarah@designstudio.io', company: 'DesignStudio', role: 'Creative Director', stage: 'active', lastInteraction: daysAgo(1) },
    { name: 'Jordan Lee', email: 'jordan@techcorp.com', company: 'TechCorp', role: 'CTO', stage: 'prospect', lastInteraction: daysAgo(3) },
    { name: 'Alex Morgan', email: 'alex@startupx.co', company: 'StartupX', role: 'CEO', stage: 'lead', lastInteraction: daysAgo(7) },
    { name: 'Pat Rivera', company: 'CloudNine', role: 'VP Engineering', stage: 'active', lastInteraction: daysAgo(2) },
  ];
}

export function generateSeedMemory(): Omit<MemoryEntry, 'id'>[] {
  return [
    { type: 'summary', title: 'Weekly Digest: Jan 13-19', content: 'Completed 8 tasks, 3 meetings, 12 emails processed. Key wins: landed CloudNine partnership, shipped auth v2. Focus areas: Q4 deck, API rate limiting.', timestamp: daysAgo(0.1), tags: ['weekly', 'digest', 'from:agent'], source: 'agent', reviewStatus: 'unread', pinned: true, relevance: 0.95 },
    { type: 'conversation', title: 'Investor pitch strategy discussion', content: 'Discussed with Marcus about positioning for Series A. Key points: focus on ARR growth, highlight enterprise pipeline. Need to prepare data room by Friday.', timestamp: daysAgo(0.3), tags: ['investors', 'strategy', 'from:chat'], source: 'chat', reviewStatus: 'unread', relevance: 0.88 },
    { type: 'note', title: 'API Architecture Decision', content: 'Decided to move to event-driven architecture for real-time updates. Using Redis pub/sub for inter-service communication. Migration plan in 3 phases.', timestamp: daysAgo(0.8), tags: ['engineering', 'architecture', 'from:notion'], source: 'notion', reviewStatus: 'reviewed', pinned: true, relevance: 0.82 },
    { type: 'document', title: 'Q4 Board Deck Draft', content: 'First draft of the Q4 board presentation. Covers: revenue metrics, product roadmap, team growth, and fundraising timeline. Needs Sarah review for design.', timestamp: daysAgo(1), tags: ['board', 'presentation', 'from:agent'], source: 'agent', reviewStatus: 'unread', relevance: 0.75 },
    { type: 'event', title: 'CloudNine Partnership Signed', content: 'Partnership agreement with CloudNine finalized. $50K/yr contract. Integration to begin next week. Pat Rivera is the primary contact.', timestamp: daysAgo(1.5), tags: ['partnership', 'milestone', 'from:email'], source: 'email', reviewStatus: 'reviewed', relevance: 0.9 },
    { type: 'task', title: 'GitHub PR Review Summary', content: 'Reviewed 5 PRs this week. Merged: caching layer, auth middleware, rate limiter. Pending: dashboard redesign, API v3 endpoints.', timestamp: daysAgo(2), tags: ['engineering', 'github', 'from:github'], source: 'github', reviewStatus: 'deferred', relevance: 0.65 },
    { type: 'conversation', title: 'Design system color tokens', content: 'Sarah proposed new color tokens for the design system. Moving to semantic naming: primary, secondary, success, warning, error. Implementation in Figma started.', timestamp: daysAgo(2.5), tags: ['design', 'system', 'from:chat'], source: 'chat', reviewStatus: 'deferred', relevance: 0.6 },
    { type: 'note', title: 'Meeting notes: Team retro', content: 'What went well: faster deployments, better code review. What to improve: documentation, onboarding flow. Action items: update README, create onboarding checklist.', timestamp: daysAgo(3), tags: ['team', 'retro', 'from:agent'], source: 'agent', relevance: 0.55 },
  ];
}

export function generateSeedInteractions(contactId: string): { type: 'email' | 'meeting' | 'call' | 'note' | 'task'; title: string; content?: string; timestamp: number }[] {
  return [
    { type: 'email', title: 'Follow-up on partnership terms', content: 'Sent revised terms. Awaiting signature.', timestamp: daysAgo(0.5) },
    { type: 'meeting', title: 'Quarterly sync call', content: 'Discussed roadmap and integration timeline.', timestamp: daysAgo(3) },
    { type: 'note', title: 'Internal notes on deal', content: 'Good fit for enterprise tier. Potential for expansion.', timestamp: daysAgo(5) },
  ];
}
