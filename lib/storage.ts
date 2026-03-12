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
  InboxItem,
  FocusSession,
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
  INBOX: '@clawbase:inbox',
  FOCUS_SESSIONS: '@clawbase:focusSessions',
  MESSAGES_PREFIX: '@clawbase:msgs:',
};

const locks = new Map<string, Promise<void>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.then(() => {}, () => {}));
  return next;
}

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`[storage] getJSON failed for key "${key}":`, e);
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
  } catch (e) {
    console.warn('[storage] SecureStore read failed for connection tokens, falling back to AsyncStorage:', e);
  }
  return getJSON<ConnectionTokenMap>(KEYS.CONNECTION_TOKENS, {});
}

async function setStoredConnectionTokens(tokens: ConnectionTokenMap): Promise<void> {
  const raw = JSON.stringify(tokens);
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(KEYS.CONNECTION_TOKENS, raw);
      await AsyncStorage.removeItem(KEYS.CONNECTION_TOKENS).catch(() => {});
      return;
    }
  } catch (e) {
    console.warn('[storage] SecureStore write failed for connection tokens, falling back to AsyncStorage:', e);
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
    return withLock(KEYS.CONNECTIONS, async () => {
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
    });
  },
  async save(conn: GatewayConnection): Promise<void> {
    return withLock(KEYS.CONNECTIONS, async () => {
      const rawConnections = await getJSON<GatewayConnection[]>(KEYS.CONNECTIONS, []);
      const tokenMap = await getStoredConnectionTokens();

      const normalized: GatewayConnection = {
        ...conn,
        token: conn.token?.trim() ? conn.token.trim() : undefined,
      };

      const all = rawConnections.map((c) => ({
        ...c,
        token: tokenMap[c.id],
      }));
      const idx = all.findIndex((c) => c.id === normalized.id);

      if (idx >= 0) all[idx] = normalized;
      else all.push(normalized);

      if (normalized.token) {
        tokenMap[normalized.id] = normalized.token;
      } else {
        delete tokenMap[normalized.id];
      }

      const strippedConnections = all.map(stripConnectionToken);
      await setJSON(KEYS.CONNECTIONS, strippedConnections);
      await setStoredConnectionTokens(tokenMap);
    });
  },
  async remove(id: string): Promise<void> {
    return withLock(KEYS.CONNECTIONS, async () => {
      const rawConnections = await getJSON<GatewayConnection[]>(KEYS.CONNECTIONS, []);
      const tokenMap = await getStoredConnectionTokens();
      delete tokenMap[id];

      const filtered = rawConnections.filter((c) => c.id !== id);
      const strippedConnections = filtered.map(stripConnectionToken);
      await setJSON(KEYS.CONNECTIONS, strippedConnections);
      await setStoredConnectionTokens(tokenMap);
    });
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
    return withLock(KEYS.CONVERSATIONS, async () => {
      const convo: Conversation = {
        id: Crypto.randomUUID(),
        title,
        lastMessageTime: Date.now(),
        messageCount: 0,
      };
      const all = await getJSON<Conversation[]>(KEYS.CONVERSATIONS, []);
      all.unshift(convo);
      await setJSON(KEYS.CONVERSATIONS, all);
      return convo;
    });
  },
  async update(id: string, updates: Partial<Conversation>): Promise<void> {
    return withLock(KEYS.CONVERSATIONS, async () => {
      const all = await getJSON<Conversation[]>(KEYS.CONVERSATIONS, []);
      const idx = all.findIndex((c) => c.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...updates };
        await setJSON(KEYS.CONVERSATIONS, all);
      }
    });
  },
  async remove(id: string): Promise<void> {
    await withLock(KEYS.CONVERSATIONS, async () => {
      const all = await getJSON<Conversation[]>(KEYS.CONVERSATIONS, []);
      await setJSON(
        KEYS.CONVERSATIONS,
        all.filter((c) => c.id !== id),
      );
    });
    await messageStorage.clearConversation(id);
  },
};

const MIGRATION_LOCK = '@clawbase:msgs:__migration__';
let migrationDone = false;

async function migrateMessagesIfNeeded(): Promise<void> {
  if (migrationDone) return;
  await withLock(MIGRATION_LOCK, async () => {
    if (migrationDone) return;
    try {
      const raw = await AsyncStorage.getItem(KEYS.MESSAGES);
      if (!raw) {
        migrationDone = true;
        return;
      }
      const legacyMessages: ChatMessage[] = JSON.parse(raw);
      if (legacyMessages.length === 0) {
        await AsyncStorage.removeItem(KEYS.MESSAGES);
        migrationDone = true;
        return;
      }

      const byConvo = new Map<string, ChatMessage[]>();
      for (const msg of legacyMessages) {
        const arr = byConvo.get(msg.conversationId) ?? [];
        arr.push(msg);
        byConvo.set(msg.conversationId, arr);
      }

      for (const [convoId, legacyMsgs] of byConvo) {
        const key = KEYS.MESSAGES_PREFIX + convoId;
        const existing = await getJSON<ChatMessage[]>(key, []);
        const existingIds = new Set(existing.map((m) => m.id));
        const merged = [...existing];
        for (const m of legacyMsgs) {
          if (!existingIds.has(m.id)) merged.push(m);
        }
        await setJSON(key, merged);
      }

      await AsyncStorage.removeItem(KEYS.MESSAGES);
      migrationDone = true;
    } catch (e) {
      console.warn('[storage] Message migration failed, will retry next access:', e);
    }
  });
}

export const messageStorage = {
  async getByConversation(conversationId: string): Promise<ChatMessage[]> {
    await migrateMessagesIfNeeded();
    const key = KEYS.MESSAGES_PREFIX + conversationId;
    const msgs = await getJSON<ChatMessage[]>(key, []);
    return msgs.sort((a, b) => a.timestamp - b.timestamp);
  },
  async add(msg: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
    await migrateMessagesIfNeeded();
    const message: ChatMessage = { ...msg, id: Crypto.randomUUID() };
    const key = KEYS.MESSAGES_PREFIX + msg.conversationId;
    return withLock(key, async () => {
      const all = await getJSON<ChatMessage[]>(key, []);
      all.push(message);
      await setJSON(key, all);
      return message;
    });
  },
  async clearConversation(conversationId: string): Promise<void> {
    const key = KEYS.MESSAGES_PREFIX + conversationId;
    await AsyncStorage.removeItem(key);
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
    return withLock(KEYS.TASKS, async () => {
      const task: Task = {
        id: Crypto.randomUUID(),
        title,
        description,
        status,
        priority,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const all = await getJSON<Task[]>(KEYS.TASKS, []);
      all.push(task);
      await setJSON(KEYS.TASKS, all);
      return task;
    });
  },
  async update(id: string, updates: Partial<Task>): Promise<void> {
    return withLock(KEYS.TASKS, async () => {
      const all = await getJSON<Task[]>(KEYS.TASKS, []);
      const idx = all.findIndex((t) => t.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...updates, updatedAt: Date.now() };
        await setJSON(KEYS.TASKS, all);
      }
    });
  },
  async remove(id: string): Promise<void> {
    return withLock(KEYS.TASKS, async () => {
      const all = await getJSON<Task[]>(KEYS.TASKS, []);
      await setJSON(
        KEYS.TASKS,
        all.filter((t) => t.id !== id),
      );
    });
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
    return withLock(KEYS.MEMORY, async () => {
      const mem: MemoryEntry = {
        ...entry,
        id: Crypto.randomUUID(),
        timestamp: Date.now(),
      };
      const all = await getJSON<MemoryEntry[]>(KEYS.MEMORY, []);
      all.push(mem);
      await setJSON(KEYS.MEMORY, all);
      return mem;
    });
  },
  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    return withLock(KEYS.MEMORY, async () => {
      const all = await getJSON<MemoryEntry[]>(KEYS.MEMORY, []);
      const idx = all.findIndex((m) => m.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...updates };
        await setJSON(KEYS.MEMORY, all);
      }
    });
  },
  async remove(id: string): Promise<void> {
    return withLock(KEYS.MEMORY, async () => {
      const all = await getJSON<MemoryEntry[]>(KEYS.MEMORY, []);
      await setJSON(
        KEYS.MEMORY,
        all.filter((m) => m.id !== id),
      );
    });
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
    return withLock(KEYS.CALENDAR, async () => {
      const calEvent: CalendarEvent = {
        ...event,
        id: Crypto.randomUUID(),
      };
      const all = await getJSON<CalendarEvent[]>(KEYS.CALENDAR, []);
      all.push(calEvent);
      await setJSON(KEYS.CALENDAR, all);
      return calEvent;
    });
  },
  async update(id: string, updates: Partial<CalendarEvent>): Promise<void> {
    return withLock(KEYS.CALENDAR, async () => {
      const all = await getJSON<CalendarEvent[]>(KEYS.CALENDAR, []);
      const idx = all.findIndex((e) => e.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...updates };
        await setJSON(KEYS.CALENDAR, all);
      }
    });
  },
  async remove(id: string): Promise<void> {
    return withLock(KEYS.CALENDAR, async () => {
      const all = await getJSON<CalendarEvent[]>(KEYS.CALENDAR, []);
      await setJSON(
        KEYS.CALENDAR,
        all.filter((e) => e.id !== id),
      );
    });
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
    return withLock(KEYS.CRM_CONTACTS, async () => {
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
    });
  },
  async update(id: string, updates: Partial<CRMContact>): Promise<void> {
    return withLock(KEYS.CRM_CONTACTS, async () => {
      const all = await getJSON<CRMContact[]>(KEYS.CRM_CONTACTS, []);
      const idx = all.findIndex((c) => c.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...updates };
        await setJSON(KEYS.CRM_CONTACTS, all);
      }
    });
  },
  async remove(id: string): Promise<void> {
    return withLock(KEYS.CRM_CONTACTS, async () => {
      const all = await getJSON<CRMContact[]>(KEYS.CRM_CONTACTS, []);
      await setJSON(
        KEYS.CRM_CONTACTS,
        all.filter((c) => c.id !== id),
      );
    });
  },
  async addInteraction(
    contactId: string,
    interaction: Omit<CRMInteraction, 'id' | 'contactId'>,
  ): Promise<CRMInteraction> {
    return withLock(KEYS.CRM_CONTACTS, async () => {
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
    });
  },
};

export const inboxStorage = {
  async getAll(): Promise<InboxItem[]> {
    const items = await getJSON<InboxItem[]>(KEYS.INBOX, []);
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
  async add(item: Omit<InboxItem, 'id' | 'createdAt'>): Promise<InboxItem> {
    return withLock(KEYS.INBOX, async () => {
      const entry: InboxItem = {
        ...item,
        id: Crypto.randomUUID(),
        createdAt: Date.now(),
      };
      const all = await getJSON<InboxItem[]>(KEYS.INBOX, []);
      all.push(entry);
      await setJSON(KEYS.INBOX, all);
      return entry;
    });
  },
  async update(id: string, updates: Partial<InboxItem>): Promise<void> {
    return withLock(KEYS.INBOX, async () => {
      const all = await getJSON<InboxItem[]>(KEYS.INBOX, []);
      const idx = all.findIndex((i) => i.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...updates };
        await setJSON(KEYS.INBOX, all);
      }
    });
  },
  async remove(id: string): Promise<void> {
    return withLock(KEYS.INBOX, async () => {
      const all = await getJSON<InboxItem[]>(KEYS.INBOX, []);
      await setJSON(KEYS.INBOX, all.filter((i) => i.id !== id));
    });
  },
  async clear(): Promise<void> {
    await setJSON(KEYS.INBOX, []);
  },
};

export const focusStorage = {
  async getAll(): Promise<FocusSession[]> {
    const sessions = await getJSON<FocusSession[]>(KEYS.FOCUS_SESSIONS, []);
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  },
  async add(session: FocusSession): Promise<FocusSession> {
    return withLock(KEYS.FOCUS_SESSIONS, async () => {
      const all = await getJSON<FocusSession[]>(KEYS.FOCUS_SESSIONS, []);
      all.push(session);
      await setJSON(KEYS.FOCUS_SESSIONS, all);
      return session;
    });
  },
  async update(id: string, updates: Partial<FocusSession>): Promise<void> {
    return withLock(KEYS.FOCUS_SESSIONS, async () => {
      const all = await getJSON<FocusSession[]>(KEYS.FOCUS_SESSIONS, []);
      const idx = all.findIndex((s) => s.id === id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...updates };
        await setJSON(KEYS.FOCUS_SESSIONS, all);
      }
    });
  },
  async remove(id: string): Promise<void> {
    return withLock(KEYS.FOCUS_SESSIONS, async () => {
      const all = await getJSON<FocusSession[]>(KEYS.FOCUS_SESSIONS, []);
      await setJSON(KEYS.FOCUS_SESSIONS, all.filter((s) => s.id !== id));
    });
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
