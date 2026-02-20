export interface GatewayConnection {
  id: string;
  name: string;
  url: string;
  token?: string;
  isActive: boolean;
  lastConnected?: number;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  status?: 'sending' | 'sent' | 'error';
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage?: string;
  lastMessageTime: number;
  messageCount: number;
  pinned?: boolean;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'deferred' | 'archived';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: number;
  updatedAt: number;
  dueDate?: number;
  tags?: string[];
  source?: string;
  assignee?: string;
  column?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  allDay?: boolean;
  location?: string;
  color?: string;
  source?: 'google' | 'apple' | 'outlook' | 'agent' | 'manual';
  attendees?: string[];
  recurring?: boolean;
  tags?: string[];
}

export interface CRMContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  avatar?: string;
  stage: 'lead' | 'prospect' | 'active' | 'customer' | 'archived';
  lastInteraction?: number;
  notes?: string;
  tags?: string[];
  interactions: CRMInteraction[];
  createdAt: number;
}

export interface CRMInteraction {
  id: string;
  contactId: string;
  type: 'email' | 'meeting' | 'call' | 'note' | 'task';
  title: string;
  content?: string;
  timestamp: number;
  source?: string;
}

export interface MemoryEntry {
  id: string;
  type: 'conversation' | 'note' | 'task' | 'event' | 'summary' | 'document';
  title: string;
  content: string;
  timestamp: number;
  tags?: string[];
  source?: string;
  pinned?: boolean;
  reviewStatus?: 'unread' | 'reviewed' | 'deferred';
  relevance?: number;
  summary?: string;
  linkedIds?: string[];
}

export interface QuickAction {
  id: string;
  icon: string;
  iconFamily: 'Ionicons' | 'Feather' | 'MaterialIcons' | 'MaterialCommunityIcons';
  label: string;
  command: string;
  color: string;
}
