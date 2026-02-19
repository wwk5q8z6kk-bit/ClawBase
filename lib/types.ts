export interface GatewayConnection {
  id: string;
  name: string;
  url: string;
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

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'deferred';

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
}

export interface MemoryEntry {
  id: string;
  type: 'conversation' | 'note' | 'task' | 'event';
  title: string;
  content: string;
  timestamp: number;
  tags?: string[];
  source?: string;
}

export interface QuickAction {
  id: string;
  icon: string;
  iconFamily: 'Ionicons' | 'Feather' | 'MaterialIcons' | 'MaterialCommunityIcons';
  label: string;
  command: string;
  color: string;
}
