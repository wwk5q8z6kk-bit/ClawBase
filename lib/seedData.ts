import type { Task, CalendarEvent, CRMContact, MemoryEntry } from './types';
import * as Crypto from 'expo-crypto';

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
    { title: 'Review Q4 financial projections', status: 'in_progress', priority: 'high', createdAt: daysAgo(2), updatedAt: daysAgo(0.1), dueDate: hoursFromNow(48), tags: ['finance', 'quarterly'], source: 'linear', assignee: 'Sarah K.' },
    { title: 'Deploy auth microservice update', status: 'todo', priority: 'urgent', createdAt: daysAgo(1), updatedAt: daysAgo(0.5), dueDate: hoursFromNow(8), tags: ['engineering', 'deploy'], source: 'github' },
    { title: 'Dentist appointment follow-up', status: 'deferred', priority: 'low', createdAt: daysAgo(5), updatedAt: daysAgo(1), tags: ['personal', 'health'] },
    { title: 'Send investor update email', status: 'done', priority: 'high', createdAt: daysAgo(3), updatedAt: daysAgo(0.2), tags: ['investors'] },
    { title: 'Design new landing page wireframes', status: 'in_progress', priority: 'medium', createdAt: daysAgo(1), updatedAt: daysAgo(0.3), tags: ['design', 'marketing'], assignee: 'Alex M.' },
    { title: 'Update API rate limiting config', status: 'todo', priority: 'medium', createdAt: daysAgo(0.5), updatedAt: daysAgo(0.5), tags: ['engineering'], source: 'github' },
    { title: 'Prepare board meeting slides', status: 'todo', priority: 'high', createdAt: daysAgo(1), updatedAt: daysAgo(0.8), dueDate: hoursFromNow(72), tags: ['board', 'presentation'] },
    { title: 'Archive old support tickets', status: 'archived', priority: 'low', createdAt: daysAgo(10), updatedAt: daysAgo(3), tags: ['support'] },
    { title: 'Review PR #247 - caching layer', status: 'todo', priority: 'medium', createdAt: daysAgo(0.2), updatedAt: daysAgo(0.2), source: 'github', tags: ['engineering', 'review'] },
    { title: 'Weekly team retro notes', status: 'done', priority: 'medium', createdAt: daysAgo(2), updatedAt: daysAgo(1.5), tags: ['team'] },
  ];
}

export function generateSeedEvents(): Omit<CalendarEvent, 'id'>[] {
  return [
    { title: 'Standup', startTime: todayAt(9, 0), endTime: todayAt(9, 15), color: '#00D4AA', source: 'google', recurring: true },
    { title: 'Design Review', startTime: todayAt(10, 30), endTime: todayAt(11, 30), color: '#5B7FFF', source: 'google', attendees: ['Alex M.', 'Jordan L.'] },
    { title: 'Lunch with Marcus', startTime: todayAt(12, 0), endTime: todayAt(13, 0), color: '#FF7B5C', source: 'manual', location: 'Sushi Palace' },
    { title: 'Investor Call', startTime: todayAt(14, 0), endTime: todayAt(15, 0), color: '#FFB020', source: 'google', description: 'Q4 review with Acme Ventures', attendees: ['Pat R.', 'Sam T.'] },
    { title: 'Focus Time', startTime: todayAt(15, 30), endTime: todayAt(17, 0), color: '#8B7FFF', source: 'google' },
    { title: 'Board Meeting Prep', startTime: todayAt(8, 0) + 86400000, endTime: todayAt(9, 0) + 86400000, color: '#FF5A3C', source: 'google' },
    { title: 'Dentist', startTime: todayAt(11, 0) + 2 * 86400000, endTime: todayAt(12, 0) + 2 * 86400000, color: '#FF9F5A', source: 'apple', location: 'Downtown Dental' },
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
    { type: 'summary', title: 'Weekly Digest: Jan 13-19', content: 'Completed 8 tasks, 3 meetings, 12 emails processed. Key wins: landed CloudNine partnership, shipped auth v2. Focus areas: Q4 deck, API rate limiting.', timestamp: daysAgo(0.1), tags: ['weekly', 'digest'], source: 'agent', reviewStatus: 'unread', pinned: true },
    { type: 'conversation', title: 'Investor pitch strategy discussion', content: 'Discussed with Marcus about positioning for Series A. Key points: focus on ARR growth, highlight enterprise pipeline. Need to prepare data room by Friday.', timestamp: daysAgo(0.3), tags: ['investors', 'strategy'], source: 'chat', reviewStatus: 'unread' },
    { type: 'note', title: 'API Architecture Decision', content: 'Decided to move to event-driven architecture for real-time updates. Using Redis pub/sub for inter-service communication. Migration plan in 3 phases.', timestamp: daysAgo(0.8), tags: ['engineering', 'architecture'], source: 'notion', reviewStatus: 'reviewed', pinned: true },
    { type: 'document', title: 'Q4 Board Deck Draft', content: 'First draft of the Q4 board presentation. Covers: revenue metrics, product roadmap, team growth, and fundraising timeline. Needs Sarah review for design.', timestamp: daysAgo(1), tags: ['board', 'presentation'], source: 'agent', reviewStatus: 'unread' },
    { type: 'event', title: 'CloudNine Partnership Signed', content: 'Partnership agreement with CloudNine finalized. $50K/yr contract. Integration to begin next week. Pat Rivera is the primary contact.', timestamp: daysAgo(1.5), tags: ['partnership', 'milestone'], source: 'email', reviewStatus: 'reviewed' },
    { type: 'task', title: 'GitHub PR Review Summary', content: 'Reviewed 5 PRs this week. Merged: caching layer, auth middleware, rate limiter. Pending: dashboard redesign, API v3 endpoints.', timestamp: daysAgo(2), tags: ['engineering', 'github'], source: 'github', reviewStatus: 'deferred' },
    { type: 'conversation', title: 'Design system color tokens', content: 'Sarah proposed new color tokens for the design system. Moving to semantic naming: primary, secondary, success, warning, error. Implementation in Figma started.', timestamp: daysAgo(2.5), tags: ['design', 'system'], source: 'chat', reviewStatus: 'deferred' },
    { type: 'note', title: 'Meeting notes: Team retro', content: 'What went well: faster deployments, better code review. What to improve: documentation, onboarding flow. Action items: update README, create onboarding checklist.', timestamp: daysAgo(3), tags: ['team', 'retro'], source: 'agent' },
  ];
}

export function generateSeedInteractions(contactId: string): { type: 'email' | 'meeting' | 'call' | 'note' | 'task'; title: string; content?: string; timestamp: number }[] {
  return [
    { type: 'email', title: 'Follow-up on partnership terms', content: 'Sent revised terms. Awaiting signature.', timestamp: daysAgo(0.5) },
    { type: 'meeting', title: 'Quarterly sync call', content: 'Discussed roadmap and integration timeline.', timestamp: daysAgo(3) },
    { type: 'note', title: 'Internal notes on deal', content: 'Good fit for enterprise tier. Potential for expansion.', timestamp: daysAgo(5) },
  ];
}
