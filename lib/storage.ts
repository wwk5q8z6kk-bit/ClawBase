import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
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
  CONNECTIONS: '@clawbase:connections',
  CONNECTION_TOKENS: '@clawbase:connectionTokens',
  ACTIVE_CONNECTION: '@clawbase:activeConnection',
  CONVERSATIONS: '@clawbase:conversations',
  MESSAGES: '@clawbase:messages',
  TASKS: '@clawbase:tasks',
  MEMORY: '@clawbase:memory',
  CALENDAR: '@clawbase:calendar',
  CRM_CONTACTS: '@clawbase:crm_contacts',
  BIOMETRIC_ENABLED: '@clawbase:biometricEnabled',
  HAS_ONBOARDED: '@clawbase:hasOnboarded',
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

type ConnectionTokenMap = Record<string, string>;

async function getStoredConnectionTokens(): Promise<ConnectionTokenMap> {
  try {
    if (Platform.OS !== 'web') {
      const raw = await SecureStore.getItemAsync(KEYS.CONNECTION_TOKENS);
      return raw ? (JSON.parse(raw) as ConnectionTokenMap) : {};
    }
  } catch {
    // Fall through to AsyncStorage fallback.
  }
  return getJSON<ConnectionTokenMap>(KEYS.CONNECTION_TOKENS, {});
}

async function setStoredConnectionTokens(tokens: ConnectionTokenMap): Promise<void> {
  const raw = JSON.stringify(tokens);
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(KEYS.CONNECTION_TOKENS, raw);
      // Best-effort cleanup of legacy fallback copy once secure write succeeds.
      await AsyncStorage.removeItem(KEYS.CONNECTION_TOKENS).catch(() => {});
      return;
    }
  } catch {
    // Fall through to AsyncStorage fallback.
  }
  await AsyncStorage.setItem(KEYS.CONNECTION_TOKENS, raw);
}

function stripConnectionToken(conn: GatewayConnection): GatewayConnection {
  return {
    id: conn.id,
    name: conn.name,
    url: conn.url,
    isActive: conn.isActive,
    status: conn.status,
    ...(conn.lastConnected !== undefined ? { lastConnected: conn.lastConnected } : {}),
  };
}

export const connectionStorage = {
  async getAll(): Promise<GatewayConnection[]> {
    const rawConnections = await getJSON<GatewayConnection[]>(KEYS.CONNECTIONS, []);
    const tokenMap = await getStoredConnectionTokens();

    let migrated = false;
    for (const conn of rawConnections) {
      if (conn.token) {
        tokenMap[conn.id] = conn.token;
        delete conn.token;
        migrated = true;
      }
    }

    if (migrated) {
      await setJSON(KEYS.CONNECTIONS, rawConnections);
      await setStoredConnectionTokens(tokenMap);
    }

    return rawConnections.map((conn) => ({
      ...conn,
      token: tokenMap[conn.id],
    }));
  },
  async save(conn: GatewayConnection): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex((c) => c.id === conn.id);

    const normalized: GatewayConnection = {
      ...conn,
      token: conn.token?.trim() ? conn.token.trim() : undefined,
    };

    if (idx >= 0) all[idx] = normalized;
    else all.push(normalized);

    const tokenMap = await getStoredConnectionTokens();
    if (normalized.token) {
      tokenMap[normalized.id] = normalized.token;
    } else {
      delete tokenMap[normalized.id];
    }

    const strippedConnections = all.map(stripConnectionToken);
    await setJSON(KEYS.CONNECTIONS, strippedConnections);
    await setStoredConnectionTokens(tokenMap);
  },
  async remove(id: string): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((c) => c.id !== id);

    const tokenMap = await getStoredConnectionTokens();
    delete tokenMap[id];

    const strippedConnections = filtered.map(stripConnectionToken);
    await setJSON(KEYS.CONNECTIONS, strippedConnections);
    await setStoredConnectionTokens(tokenMap);
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
  async clearConversation(conversationId: string): Promise<void> {
    const all = await getJSON<ChatMessage[]>(KEYS.MESSAGES, []);
    const remaining = all.filter((m) => m.conversationId !== conversationId);
    await setJSON(KEYS.MESSAGES, remaining);
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
