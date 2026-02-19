import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type {
  GatewayConnection,
  ChatMessage,
  Conversation,
  Task,
  TaskStatus,
  MemoryEntry,
  CalendarEvent,
  CRMContact,
  CRMInteraction,
} from './types';

const KEYS = {
  CONNECTIONS: '@clawcockpit:connections',
  ACTIVE_CONNECTION: '@clawcockpit:activeConnection',
  CONVERSATIONS: '@clawcockpit:conversations',
  MESSAGES: '@clawcockpit:messages',
  TASKS: '@clawcockpit:tasks',
  MEMORY: '@clawcockpit:memory',
  CALENDAR: '@clawcockpit:calendar',
  CRM_CONTACTS: '@clawcockpit:crm_contacts',
  BIOMETRIC_ENABLED: '@clawcockpit:biometricEnabled',
  HAS_ONBOARDED: '@clawcockpit:hasOnboarded',
};

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const connectionStorage = {
  async getAll(): Promise<GatewayConnection[]> {
    return getJSON(KEYS.CONNECTIONS, []);
  },
  async save(conn: GatewayConnection): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex((c) => c.id === conn.id);
    if (idx >= 0) all[idx] = conn;
    else all.push(conn);
    await setJSON(KEYS.CONNECTIONS, all);
  },
  async remove(id: string): Promise<void> {
    const all = await this.getAll();
    await setJSON(
      KEYS.CONNECTIONS,
      all.filter((c) => c.id !== id),
    );
  },
  async getActive(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.ACTIVE_CONNECTION);
  },
  async setActive(id: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.ACTIVE_CONNECTION, id);
  },
};

export const conversationStorage = {
  async getAll(): Promise<Conversation[]> {
    const convos = await getJSON<Conversation[]>(KEYS.CONVERSATIONS, []);
    return convos.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  },
  async create(title: string): Promise<Conversation> {
    const convo: Conversation = {
      id: Crypto.randomUUID(),
      title,
      lastMessageTime: Date.now(),
      messageCount: 0,
    };
    const all = await this.getAll();
    all.unshift(convo);
    await setJSON(KEYS.CONVERSATIONS, all);
    return convo;
  },
  async update(id: string, updates: Partial<Conversation>): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates };
      await setJSON(KEYS.CONVERSATIONS, all);
    }
  },
  async remove(id: string): Promise<void> {
    const all = await this.getAll();
    await setJSON(
      KEYS.CONVERSATIONS,
      all.filter((c) => c.id !== id),
    );
    const allMessages = await getJSON<ChatMessage[]>(KEYS.MESSAGES, []);
    await setJSON(
      KEYS.MESSAGES,
      allMessages.filter((m) => m.conversationId !== id),
    );
  },
};

export const messageStorage = {
  async getByConversation(conversationId: string): Promise<ChatMessage[]> {
    const all = await getJSON<ChatMessage[]>(KEYS.MESSAGES, []);
    return all
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.timestamp - b.timestamp);
  },
  async add(msg: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
    const message: ChatMessage = { ...msg, id: Crypto.randomUUID() };
    const all = await getJSON<ChatMessage[]>(KEYS.MESSAGES, []);
    all.push(message);
    await setJSON(KEYS.MESSAGES, all);
    return message;
  },
};

export const taskStorage = {
  async getAll(): Promise<Task[]> {
    return getJSON(KEYS.TASKS, []);
  },
  async create(
    title: string,
    status: TaskStatus = 'todo',
    priority: Task['priority'] = 'medium',
    description?: string,
  ): Promise<Task> {
    const task: Task = {
      id: Crypto.randomUUID(),
      title,
      description,
      status,
      priority,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const all = await this.getAll();
    all.push(task);
    await setJSON(KEYS.TASKS, all);
    return task;
  },
  async update(id: string, updates: Partial<Task>): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex((t) => t.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates, updatedAt: Date.now() };
      await setJSON(KEYS.TASKS, all);
    }
  },
  async remove(id: string): Promise<void> {
    const all = await this.getAll();
    await setJSON(
      KEYS.TASKS,
      all.filter((t) => t.id !== id),
    );
  },
};

export const memoryStorage = {
  async getAll(): Promise<MemoryEntry[]> {
    const entries = await getJSON<MemoryEntry[]>(KEYS.MEMORY, []);
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  },
  async add(
    entry: Omit<MemoryEntry, 'id' | 'timestamp'>,
  ): Promise<MemoryEntry> {
    const mem: MemoryEntry = {
      ...entry,
      id: Crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const all = await getJSON<MemoryEntry[]>(KEYS.MEMORY, []);
    all.push(mem);
    await setJSON(KEYS.MEMORY, all);
    return mem;
  },
  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    const all = await getJSON<MemoryEntry[]>(KEYS.MEMORY, []);
    const idx = all.findIndex((m) => m.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates };
      await setJSON(KEYS.MEMORY, all);
    }
  },
  async remove(id: string): Promise<void> {
    const all = await getJSON<MemoryEntry[]>(KEYS.MEMORY, []);
    await setJSON(
      KEYS.MEMORY,
      all.filter((m) => m.id !== id),
    );
  },
  async search(query: string): Promise<MemoryEntry[]> {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  },
};

export const calendarStorage = {
  async getAll(): Promise<CalendarEvent[]> {
    const events = await getJSON<CalendarEvent[]>(KEYS.CALENDAR, []);
    return events.sort((a, b) => a.startTime - b.startTime);
  },
  async create(
    event: Omit<CalendarEvent, 'id'>,
  ): Promise<CalendarEvent> {
    const calEvent: CalendarEvent = {
      ...event,
      id: Crypto.randomUUID(),
    };
    const all = await getJSON<CalendarEvent[]>(KEYS.CALENDAR, []);
    all.push(calEvent);
    await setJSON(KEYS.CALENDAR, all);
    return calEvent;
  },
  async update(id: string, updates: Partial<CalendarEvent>): Promise<void> {
    const all = await getJSON<CalendarEvent[]>(KEYS.CALENDAR, []);
    const idx = all.findIndex((e) => e.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates };
      await setJSON(KEYS.CALENDAR, all);
    }
  },
  async remove(id: string): Promise<void> {
    const all = await getJSON<CalendarEvent[]>(KEYS.CALENDAR, []);
    await setJSON(
      KEYS.CALENDAR,
      all.filter((e) => e.id !== id),
    );
  },
  async getByDateRange(start: number, end: number): Promise<CalendarEvent[]> {
    const all = await this.getAll();
    return all.filter(
      (e) =>
        (e.startTime >= start && e.startTime < end) ||
        (e.endTime > start && e.endTime <= end) ||
        (e.startTime <= start && e.endTime >= end),
    );
  },
};

export const crmStorage = {
  async getAll(): Promise<CRMContact[]> {
    const contacts = await getJSON<CRMContact[]>(KEYS.CRM_CONTACTS, []);
    return contacts.sort(
      (a, b) => (b.lastInteraction || b.createdAt) - (a.lastInteraction || a.createdAt),
    );
  },
  async create(
    contact: Omit<CRMContact, 'id' | 'createdAt' | 'interactions'>,
  ): Promise<CRMContact> {
    const c: CRMContact = {
      ...contact,
      id: Crypto.randomUUID(),
      createdAt: Date.now(),
      interactions: [],
    };
    const all = await getJSON<CRMContact[]>(KEYS.CRM_CONTACTS, []);
    all.push(c);
    await setJSON(KEYS.CRM_CONTACTS, all);
    return c;
  },
  async update(id: string, updates: Partial<CRMContact>): Promise<void> {
    const all = await getJSON<CRMContact[]>(KEYS.CRM_CONTACTS, []);
    const idx = all.findIndex((c) => c.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates };
      await setJSON(KEYS.CRM_CONTACTS, all);
    }
  },
  async remove(id: string): Promise<void> {
    const all = await getJSON<CRMContact[]>(KEYS.CRM_CONTACTS, []);
    await setJSON(
      KEYS.CRM_CONTACTS,
      all.filter((c) => c.id !== id),
    );
  },
  async addInteraction(
    contactId: string,
    interaction: Omit<CRMInteraction, 'id' | 'contactId'>,
  ): Promise<CRMInteraction> {
    const all = await getJSON<CRMContact[]>(KEYS.CRM_CONTACTS, []);
    const idx = all.findIndex((c) => c.id === contactId);
    if (idx < 0) throw new Error('Contact not found');
    const entry: CRMInteraction = {
      ...interaction,
      id: Crypto.randomUUID(),
      contactId,
    };
    all[idx].interactions.push(entry);
    all[idx].lastInteraction = entry.timestamp;
    await setJSON(KEYS.CRM_CONTACTS, all);
    return entry;
  },
};

export const settingsStorage = {
  async getBiometricEnabled(): Promise<boolean> {
    const val = await AsyncStorage.getItem(KEYS.BIOMETRIC_ENABLED);
    return val === 'true';
  },
  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.BIOMETRIC_ENABLED, String(enabled));
  },
  async getHasOnboarded(): Promise<boolean> {
    const val = await AsyncStorage.getItem(KEYS.HAS_ONBOARDED);
    return val === 'true';
  },
  async setHasOnboarded(val: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.HAS_ONBOARDED, String(val));
  },
};
