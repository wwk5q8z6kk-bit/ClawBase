import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { router } from 'expo-router';
import {
  connectionStorage,
  conversationStorage,
  messageStorage,
  taskStorage,
  memoryStorage,
  calendarStorage,
  crmStorage,
  settingsStorage,
  inboxStorage,
} from './storage';
import {
  generateSeedTasks,
  generateSeedEvents,
  generateSeedContacts,
  generateSeedMemory,
  generateSeedInteractions,
} from './seedData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  GatewayConnection,
  Conversation,
  ChatMessage,
  Task,
  TaskStatus,
  MemoryEntry,
  CalendarEvent,
  CRMContact,
  CRMInteraction,
  InboxItem,
} from './types';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { getGateway, OpenClawGateway, GatewayStatus, GatewayInfo, GatewaySession, GatewayMemoryFile } from './gateway';
import {
  setupNotificationHandler,
  setupNotificationCategories,
  registerForPushNotifications,
  showLocalNotification,
} from './notifications';
import {
  getRecipesByTriggerType,
  shouldScheduleTriggerFire,
  doesKeywordMatch,
  doesEntityCreatedMatch,
  executeRecipeActions,
  type ScheduleTriggerConfig,
  type KeywordTriggerConfig,
  type EntityCreatedTriggerConfig,
  type ActionExecutor,
} from './automationRecipes';

interface AppContextValue {
  connections: GatewayConnection[];
  activeConnection: GatewayConnection | null;
  addConnection: (name: string, url: string, token?: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  setActiveConnection: (id: string) => Promise<void>;

  conversations: Conversation[];
  createConversation: (title: string) => Promise<Conversation>;
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  getMessages: (conversationId: string) => Promise<ChatMessage[]>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;

  tasks: Task[];
  createTask: (
    title: string,
    status?: TaskStatus,
    priority?: Task['priority'],
    description?: string,
    meta?: { source?: string; tags?: string[] },
  ) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  memoryEntries: MemoryEntry[];
  createMemoryEntry: (entry: Omit<MemoryEntry, 'id' | 'timestamp'>) => Promise<MemoryEntry>;
  deleteMemoryEntry: (id: string) => Promise<void>;
  searchMemory: (query: string) => Promise<MemoryEntry[]>;
  updateMemoryEntry: (id: string, updates: Partial<MemoryEntry>) => Promise<void>;

  calendarEvents: CalendarEvent[];
  createCalendarEvent: (event: Omit<CalendarEvent, 'id'>) => Promise<CalendarEvent>;
  updateCalendarEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<void>;
  deleteCalendarEvent: (id: string) => Promise<void>;

  crmContacts: CRMContact[];
  createCRMContact: (contact: Omit<CRMContact, 'id' | 'createdAt' | 'interactions'>) => Promise<void>;
  updateCRMContact: (id: string, updates: Partial<CRMContact>) => Promise<void>;
  deleteCRMContact: (id: string) => Promise<void>;
  addCRMInteraction: (contactId: string, interaction: Omit<CRMInteraction, 'id' | 'contactId'>) => Promise<void>;

  biometricEnabled: boolean;
  setBiometricEnabled: (val: boolean) => Promise<void>;
  hasOnboarded: boolean;
  setHasOnboarded: (val: boolean) => Promise<void>;

  isLoading: boolean;
  refreshAll: () => Promise<void>;

  gateway: OpenClawGateway;
  gatewayStatus: GatewayStatus;
  gatewayInfo: GatewayInfo;
  gatewaySessions: GatewaySession[];
  gatewayMemoryFiles: GatewayMemoryFile[];
  connectGateway: (url: string, token: string) => Promise<void>;
  disconnectGateway: () => void;
  sendGatewayChat: (message: string, sessionKey?: string) => Promise<void>;
  fetchGatewaySessions: () => Promise<GatewaySession[]>;
  fetchGatewaySessionHistory: (sessionKey: string) => Promise<any[]>;
  fetchGatewayMemory: () => Promise<GatewayMemoryFile[]>;
  streamingText: string | null;
  isStreaming: boolean;

  inboxItems: InboxItem[];
  addInboxItem: (rawText: string, source?: 'braindump' | 'voice', parsed?: { parsedTitle: string; parsedCategory: 'task' | 'event' | 'note'; parsedPriority: 'low' | 'medium' | 'high' | 'urgent'; parsedDueDate?: number }) => Promise<InboxItem>;
  updateInboxItem: (id: string, updates: Partial<InboxItem>) => Promise<void>;
  deleteInboxItem: (id: string) => Promise<void>;
  clearInbox: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<GatewayConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [crmContacts, setCrmContacts] = useState<CRMContact[]>([]);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [hasOnboarded, setHasOnboardedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [gateway] = useState<OpenClawGateway>(() => getGateway());
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>('disconnected');
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo>({
    channels: [],
    activeSessionCount: 0,
    totalSessions: 0,
    skills: [],
  });
  const [gatewaySessions, setGatewaySessions] = useState<GatewaySession[]>([]);
  const [gatewayMemoryFiles, setGatewayMemoryFiles] = useState<GatewayMemoryFile[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);

  const seedIfNeeded = useCallback(async () => {
    const seeded = await AsyncStorage.getItem('@clawbase:seeded');
    if (seeded) return;

    const seedTasks = generateSeedTasks();
    for (const t of seedTasks) {
      await taskStorage.create(t.title, t.status, t.priority, t.description);
      const all = await taskStorage.getAll();
      const created = all[all.length - 1];
      if (created) {
        await taskStorage.update(created.id, {
          dueDate: t.dueDate,
          tags: t.tags,
          source: t.source,
          assignee: t.assignee,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        });
      }
    }

    const seedEvents = generateSeedEvents();
    for (const e of seedEvents) {
      await calendarStorage.create(e);
    }

    const seedContacts = generateSeedContacts();
    for (const c of seedContacts) {
      const created = await crmStorage.create(c);
      if (created.stage === 'customer' || created.stage === 'active') {
        const interactions = generateSeedInteractions(created.id);
        for (const inter of interactions) {
          await crmStorage.addInteraction(created.id, inter);
        }
      }
    }

    const seedMemory = generateSeedMemory();
    const createdMemoryEntries: { id: string; tags?: string[]; title: string; content: string }[] = [];
    for (const m of seedMemory) {
      const entry = await memoryStorage.add({
        type: m.type,
        title: m.title,
        content: m.content,
        source: m.source,
        tags: m.tags,
        pinned: m.pinned,
        reviewStatus: m.reviewStatus,
        relevance: m.relevance,
      });
      if (m.timestamp !== undefined) {
        await memoryStorage.update(entry.id, { timestamp: m.timestamp });
      }
      createdMemoryEntries.push({ id: entry.id, tags: m.tags, title: m.title, content: m.content });
    }

    try {
      const { addLink } = await import('@/lib/entityLinks');
      const allTasks = await taskStorage.getAll();
      const allContacts = await crmStorage.getAll();

      for (const mem of createdMemoryEntries) {
        const memTags = (mem.tags || []).filter(t => !t.startsWith('from:'));
        for (const task of allTasks) {
          const taskTags = (task.tags || []).filter(t => !t.startsWith('from:'));
          const shared = taskTags.filter(t => memTags.includes(t));
          if (shared.length > 0) {
            await addLink('memory', mem.id, 'task', task.id, 'related_to');
          }
        }
        for (const contact of allContacts) {
          if (mem.content.toLowerCase().includes(contact.name.split(' ')[0].toLowerCase())) {
            await addLink('memory', mem.id, 'contact', contact.id, 'mentions');
          }
        }
      }

      const allEvents = await calendarStorage.getAll();
      for (const event of allEvents) {
        if (event.attendees && event.attendees.length > 0) {
          for (const attendee of event.attendees) {
            const attendeeLower = attendee.toLowerCase().trim();
            const attendeeParts = attendeeLower.split(/\s+/);
            const matchedContact = allContacts.find(c => {
              const contactParts = c.name.toLowerCase().split(/\s+/);
              if (contactParts[0] === attendeeParts[0] && attendeeParts.length > 1 && contactParts.length > 1 && contactParts[1][0] === attendeeParts[1][0]) return true;
              if (contactParts[0] === attendeeParts[0] && contactParts.length === 1) return true;
              return c.name.toLowerCase() === attendeeLower;
            });
            if (matchedContact) {
              await addLink('calendar', event.id, 'contact', matchedContact.id, 'mentions');
            }
          }
        }
        if (event.description) {
          const descLower = event.description.toLowerCase();
          for (const task of allTasks) {
            const taskKeywords = task.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
            const matchCount = taskKeywords.filter(w => descLower.includes(w)).length;
            if (matchCount >= 2) {
              await addLink('calendar', event.id, 'task', task.id, 'related_to');
            }
          }
        }
      }
    } catch {}

    await AsyncStorage.setItem('@clawbase:seeded', 'true');
  }, []);

  const loadAll = useCallback(async () => {
    try {
      await seedIfNeeded();
      const [conns, convos, allTasks, memory, events, contacts, bioEnabled, onboarded, activeId, inbox] =
        await Promise.all([
          connectionStorage.getAll(),
          conversationStorage.getAll(),
          taskStorage.getAll(),
          memoryStorage.getAll(),
          calendarStorage.getAll(),
          crmStorage.getAll(),
          settingsStorage.getBiometricEnabled(),
          settingsStorage.getHasOnboarded(),
          connectionStorage.getActive(),
          inboxStorage.getAll(),
        ]);
      setConnections(conns);
      setConversations(convos);
      setTasks(allTasks);
      setMemoryEntries(memory);
      setCalendarEvents(events);
      setCrmContacts(contacts);
      setBiometricEnabledState(bioEnabled);
      setHasOnboardedState(onboarded);
      setActiveConnectionId(activeId);
      setInboxItems(inbox);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setIsLoading(false);
    }
  }, [seedIfNeeded]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const unsub1 = gateway.on('status_change', (event) => {
      setGatewayStatus(event.data.status);
    });
    const unsub2 = gateway.on('gateway_info', (event) => {
      setGatewayInfo(event.data);
    });
    const unsub3 = gateway.on('sessions_list', (event) => {
      setGatewaySessions(event.data);
    });
    const unsub4 = gateway.on('memory_data', (event) => {
      setGatewayMemoryFiles(event.data);
    });
    const INTERNAL_SESSIONS = new Set(['agent:braindump:parser']);
    const unsub5 = gateway.on('message_chunk', (event) => {
      if (event.data?.sessionKey && INTERNAL_SESSIONS.has(event.data.sessionKey)) return;
      setStreamingText(event.data.text);
      setIsStreaming(true);
    });
    const unsub6 = gateway.on('message_complete', async (event) => {
      if (event.data?.sessionKey && INTERNAL_SESSIONS.has(event.data.sessionKey)) return;
      setStreamingText(null);
      setIsStreaming(false);

      const fullText = event.data?.text;
      if (fullText) {
        try {
          const kwRecipes = await getRecipesByTriggerType('keyword');
          const executor: ActionExecutor = {
            createTask: async (title, status, priority, description) => {
              const task = await taskStorage.create(title, status as any || 'todo', priority as any || 'medium', description);
              setTasks((prev) => [...prev, task]);
              return task;
            },
            createMemoryEntry: async (entry) => {
              const created = await memoryStorage.add(entry);
              setMemoryEntries((prev) => [created, ...prev]);
            },
            sendGatewayChat: async (message, sessionKey) => {
              if (gateway.isConnected()) await gateway.sendChat(message, sessionKey);
            },
            showNotification: (title, body) => {
              showLocalNotification({ title, body, data: { type: 'automation' }, categoryIdentifier: 'alert', channelId: 'alerts' });
            },
          };
          for (const recipe of kwRecipes) {
            if (doesKeywordMatch(recipe.trigger.config as KeywordTriggerConfig, fullText)) {
              console.log(`[AutomationEngine] keyword trigger fired on incoming: ${recipe.name}`);
              await executeRecipeActions(recipe, executor);
            }
          }
        } catch {}
      }
      if (fullText && fullText.length > 20) {
        try {
          const { addLink } = await import('@/lib/entityLinks');
          const memEntry = await memoryStorage.add({
            type: 'conversation',
            title: fullText.slice(0, 60).replace(/\n/g, ' '),
            content: fullText,
            source: 'gateway',
            tags: ['from:gateway'],
            reviewStatus: 'unread',
          });
          setMemoryEntries(await memoryStorage.getAll());

          const sessionKey = event.data?.sessionKey;
          if (sessionKey) {
            await addLink('memory', memEntry.id, 'conversation', sessionKey, 'created_from');
          }
        } catch {}
      }
    });
    const unsub7 = gateway.on('error', (event) => {
      console.log('[AppContext] Gateway error:', event.data?.message || event.data);
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
      unsub7();
    };
  }, [gateway]);

  // ------ Notification setup ------
  useEffect(() => {
    setupNotificationHandler();
    setupNotificationCategories();
  }, []);

  // Register push token when gateway connects + flush offline queue
  useEffect(() => {
    if (gatewayStatus === 'connected') {
      registerForPushNotifications().then((token) => {
        if (token) {
          gateway.registerPushToken(token);
        }
      });

      // Flush queued offline messages after a short delay
      const timer = setTimeout(async () => {
        try {
          const { flushQueue } = await import('@/lib/offlineQueue');
          const sent = await flushQueue(async (_convId, content) => {
            await gateway.sendChat(content);
          });
          if (sent > 0) {
            console.log(`[OfflineQueue] Flushed ${sent} queued messages`);
          }
        } catch (err) {
          console.error('[OfflineQueue] Flush failed:', err);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [gatewayStatus, gateway]);

  // Handle interactive notification responses (Approve / Deny buttons) + deep linking
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const actionId = response.actionIdentifier;
      const data = response.notification.request.content.data;
      const approvalId = data?.approvalId as string | undefined;
      const notifType = data?.type as string | undefined;
      const conversationId = data?.conversationId as string | undefined;

      if (approvalId && actionId === 'approve') {
        gateway.approveAction(approvalId);
        return;
      }
      if (approvalId && actionId === 'deny') {
        gateway.denyAction(approvalId);
        return;
      }

      // Deep linking — default tap (no action button)
      if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER || !actionId) {
        if (approvalId || notifType === 'approval') {
          router.push('/(tabs)/automations');
        } else if (conversationId) {
          router.push(`/chat/${conversationId}`);
        } else if (notifType === 'error') {
          router.push('/(tabs)/automations');
        } else {
          router.push('/(tabs)/chat');
        }
      }
    });

    return () => sub.remove();
  }, [gateway]);

  // Show local notification when gateway sends a notification event while app is foregrounded
  useEffect(() => {
    const unsub = gateway.on('notification', (event) => {
      const { title, body, approvalId, category } = event.data || {};
      showLocalNotification({
        title: title || 'ClawBase',
        body: body || 'New notification from your agent',
        data: approvalId ? { approvalId } : {},
        categoryIdentifier: category || (approvalId ? 'approval' : 'alert'),
        channelId: approvalId ? 'approvals' : 'alerts',
      });
    });
    return unsub;
  }, [gateway]);

  const automationExecutorRef = React.useRef<ActionExecutor | null>(null);

  const getAutomationExecutor = useCallback((): ActionExecutor => {
    if (automationExecutorRef.current) return automationExecutorRef.current;
    const executor: ActionExecutor = {
      createTask: async (title, status, priority, description) => {
        try {
          const validStatuses = ['todo', 'in_progress', 'done', 'deferred', 'archived'];
          const validPriorities = ['low', 'medium', 'high', 'urgent'];
          const safeStatus = (validStatuses.includes(status || '') ? status : 'todo') as TaskStatus;
          const safePriority = (validPriorities.includes(priority || '') ? priority : 'medium') as Task['priority'];
          const task = await taskStorage.create(title, safeStatus, safePriority, description);
          setTasks((prev) => [...prev, task]);
          return task;
        } catch (e) {
          console.warn('[automation] Failed to create task:', e);
          throw e;
        }
      },
      createMemoryEntry: async (entry) => {
        try {
          const created = await memoryStorage.add(entry);
          setMemoryEntries((prev) => [created, ...prev]);
        } catch (e) {
          console.warn('[automation] Failed to create memory entry:', e);
          throw e;
        }
      },
      sendGatewayChat: async (message, sessionKey) => {
        if (!gateway.isConnected()) {
          const err = new Error('Gateway not connected');
          console.warn('[automation] Cannot send chat: gateway not connected');
          throw err;
        }
        try {
          await gateway.sendChat(message, sessionKey);
        } catch (e) {
          console.warn('[automation] Failed to send gateway chat:', e);
          throw e;
        }
      },
      showNotification: (title, body) => {
        try {
          showLocalNotification({
            title,
            body,
            data: { type: 'automation' },
            categoryIdentifier: 'alert',
            channelId: 'alerts',
          });
        } catch (e) {
          console.warn('[automation] Failed to show notification:', e);
        }
      },
      sendGatewayCommand: async (command, args) => {
        if (!gateway.isConnected()) {
          const err = new Error('Gateway not connected');
          console.warn('[automation] Cannot send command: gateway not connected');
          throw err;
        }
        try {
          await gateway.sendChat(`/${command} ${args ? Object.values(args).join(' ') : ''}`);
        } catch (e) {
          console.warn('[automation] Failed to send gateway command:', e);
          throw e;
        }
      },
    };
    automationExecutorRef.current = executor;
    return executor;
  }, [gateway]);

  const runEntityCreatedTriggers = useCallback(async (entityType: string) => {
    try {
      const recipes = await getRecipesByTriggerType('entity_created');
      const executor = getAutomationExecutor();
      for (const recipe of recipes) {
        if (doesEntityCreatedMatch(recipe.trigger.config as EntityCreatedTriggerConfig, entityType)) {
          console.log(`[AutomationEngine] entity_created trigger fired: ${recipe.name}`);
          await executeRecipeActions(recipe, executor);
        }
      }
    } catch (err) {
      console.warn('[AutomationEngine] entity_created trigger error:', err);
    }
  }, [getAutomationExecutor]);

  const runKeywordTriggers = useCallback(async (message: string) => {
    try {
      const recipes = await getRecipesByTriggerType('keyword');
      const executor = getAutomationExecutor();
      for (const recipe of recipes) {
        if (doesKeywordMatch(recipe.trigger.config as KeywordTriggerConfig, message)) {
          console.log(`[AutomationEngine] keyword trigger fired: ${recipe.name}`);
          await executeRecipeActions(recipe, executor);
        }
      }
    } catch (err) {
      console.warn('[AutomationEngine] keyword trigger error:', err);
    }
  }, [getAutomationExecutor]);

  useEffect(() => {
    if (isLoading) return;

    const checkScheduleTriggers = async () => {
      try {
        const recipes = await getRecipesByTriggerType('schedule');
        const executor = getAutomationExecutor();
        for (const recipe of recipes) {
          if (shouldScheduleTriggerFire(recipe.trigger.config as ScheduleTriggerConfig, recipe.lastRun)) {
            console.log(`[AutomationEngine] schedule trigger fired: ${recipe.name}`);
            await executeRecipeActions(recipe, executor);
          }
        }
      } catch (err) {
        console.warn('[AutomationEngine] schedule check error:', err);
      }
    };

    checkScheduleTriggers();
    const intervalId = setInterval(checkScheduleTriggers, 60000);
    return () => clearInterval(intervalId);
  }, [isLoading, getAutomationExecutor]);

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === activeConnectionId) || null,
    [connections, activeConnectionId],
  );

  useEffect(() => {
    if (activeConnection && activeConnection.url && (gatewayStatus === 'disconnected' || gatewayStatus === 'error')) {
      console.log('[AppContext] Auto-connecting to:', activeConnection.url, 'status:', gatewayStatus);
      gateway.connect(activeConnection.url, activeConnection.token || '').catch((e) => {
        console.log('[AppContext] Auto-connect failed:', e);
      });
    }
  }, [activeConnection, gateway, gatewayStatus]);

  const addConnection = useCallback(
    async (name: string, url: string, token?: string) => {
      const conn: GatewayConnection = {
        id: Crypto.randomUUID(),
        name,
        url,
        token,
        isActive: true,
        status: 'disconnected',
        lastConnected: Date.now(),
      };
      await connectionStorage.save(conn);
      await connectionStorage.setActive(conn.id);
      setConnections((prev) => [...prev, conn]);
      setActiveConnectionId(conn.id);
    },
    [],
  );

  const removeConnection = useCallback(async (id: string) => {
    await connectionStorage.remove(id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const setActiveConnectionFn = useCallback(async (id: string) => {
    await connectionStorage.setActive(id);
    setActiveConnectionId(id);
  }, []);

  const createConversation = useCallback(async (title: string) => {
    const convo = await conversationStorage.create(title);
    setConversations((prev) => [convo, ...prev]);
    return convo;
  }, []);

  const updateConversation = useCallback(async (id: string, updates: Partial<Conversation>) => {
    await conversationStorage.update(id, updates);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await conversationStorage.remove(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    try { const { removeLinksFor } = await import('@/lib/entityLinks'); await removeLinksFor('conversation', id); } catch {}
  }, []);

  const getMessages = useCallback(async (conversationId: string) => {
    return messageStorage.getByConversation(conversationId);
  }, []);

  const simulateResponse = useCallback(
    async (conversationId: string, userContent: string) => {
      const responses = [
        "I've analyzed your request. Here's what I found...",
        'Task completed successfully. The changes have been applied.',
        "I'm processing that now. Based on the current data, everything looks good.",
        'Done! I updated the relevant records and synced the changes.',
        "Let me check on that. According to the latest data, here's the summary.",
        "I've scheduled that for you. You'll receive a notification when it's ready.",
        'Analysis complete. All systems are operating normally.',
      ];
      const response =
        responses[Math.floor(Math.random() * responses.length)];

      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

      const assistantMsg = await messageStorage.add({
        conversationId,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        status: 'sent',
      });

      await conversationStorage.update(conversationId, {
        lastMessage: response,
        lastMessageTime: Date.now(),
      });

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessage: response, lastMessageTime: Date.now(), messageCount: c.messageCount + 1 }
            : c,
        ),
      );

      const memEntry = await memoryStorage.add({
        type: 'conversation',
        title: userContent.slice(0, 50),
        content: response,
        source: 'chat',
        tags: ['from:chat'],
        linkedIds: [conversationId],
      });

      try {
        const { addLink } = await import('@/lib/entityLinks');
        await addLink('memory', memEntry.id, 'conversation', conversationId, 'created_from');

        const combinedText = (userContent + ' ' + response).toLowerCase();

        const currentContacts = await crmStorage.getAll();
        for (const contact of currentContacts) {
          const parts = contact.name.split(' ');
          const firstName = parts[0]?.toLowerCase();
          if (firstName && firstName.length >= 3 && combinedText.includes(firstName)) {
            if (parts.length < 2 || !combinedText.includes(parts[1]?.toLowerCase().charAt(0))) continue;
            await addLink('memory', memEntry.id, 'contact', contact.id, 'mentions');
          }
        }

        const currentTasks = await taskStorage.getAll();
        for (const task of currentTasks) {
          const taskWords = task.title.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 5);
          const matchCount = taskWords.filter((w: string) => combinedText.includes(w)).length;
          if (matchCount >= 2) {
            await addLink('memory', memEntry.id, 'task', task.id, 'mentions');
          }
        }

        const currentEvents = await calendarStorage.getAll();
        for (const event of currentEvents) {
          const eventWords = event.title.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 5);
          const matchCount = eventWords.filter((w: string) => combinedText.includes(w)).length;
          if (matchCount >= 2) {
            await addLink('memory', memEntry.id, 'calendar', event.id, 'mentions');
          }
        }
      } catch {}

      const allMem = await memoryStorage.getAll();
      setMemoryEntries(allMem);

      return assistantMsg;
    },
    [],
  );

  const sendMessage = useCallback(
    async (conversationId: string, content: string) => {
      await messageStorage.add({
        conversationId,
        role: 'user',
        content,
        timestamp: Date.now(),
        status: 'sent',
      });

      await conversationStorage.update(conversationId, {
        lastMessage: content,
        lastMessageTime: Date.now(),
        messageCount:
          (conversations.find((c) => c.id === conversationId)?.messageCount || 0) + 1,
      });

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessage: content, lastMessageTime: Date.now(), messageCount: c.messageCount + 1 }
            : c,
        ),
      );

      if (gateway.isConnected()) {
        try {
          await gateway.sendChat(content);
        } catch {
          await simulateResponse(conversationId, content);
        }
      } else {
        await simulateResponse(conversationId, content);
      }
    },
    [conversations, simulateResponse, gateway],
  );

  const createTask = useCallback(
    async (
      title: string,
      status: TaskStatus = 'todo',
      priority: Task['priority'] = 'medium',
      description?: string,
      meta?: { source?: string; tags?: string[] },
    ): Promise<Task> => {
      const task = await taskStorage.create(title, status, priority, description);
      const source = meta?.source || 'manual';
      const sourceTag = `from:${source}`;
      const tags = meta?.tags ? [...meta.tags] : [];
      if (!tags.includes(sourceTag)) tags.push(sourceTag);
      if (tags.length > 0 || source !== 'manual') {
        await taskStorage.update(task.id, { source, tags });
        task.source = source;
        task.tags = tags;
      }
      setTasks((prev) => [...prev, task]);
      runEntityCreatedTriggers('task');
      return task;
    },
    [runEntityCreatedTriggers],
  );

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    await taskStorage.update(id, updates);
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t)),
    );
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    await taskStorage.remove(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try { const { removeLinksFor } = await import('@/lib/entityLinks'); await removeLinksFor('task', id); } catch {}
  }, []);

  const createMemoryEntry = useCallback(async (entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> => {
    const source = entry.source || 'manual';
    const sourceTag = `from:${source}`;
    const tags = entry.tags ? [...entry.tags] : [];
    if (!tags.includes(sourceTag)) tags.push(sourceTag);
    const created = await memoryStorage.add({ ...entry, tags });
    setMemoryEntries((prev) => [created, ...prev]);
    runEntityCreatedTriggers('memory');
    return created;
  }, [runEntityCreatedTriggers]);

  const deleteMemoryEntry = useCallback(async (id: string) => {
    await memoryStorage.remove(id);
    setMemoryEntries((prev) => prev.filter((m) => m.id !== id));
    try { const { removeLinksFor } = await import('@/lib/entityLinks'); await removeLinksFor('memory', id); } catch {}
  }, []);

  const searchMemory = useCallback(async (query: string) => {
    if (!query.trim()) return memoryStorage.getAll();
    return memoryStorage.search(query);
  }, []);

  const updateMemoryEntry = useCallback(async (id: string, updates: Partial<MemoryEntry>) => {
    await memoryStorage.update(id, updates);
    setMemoryEntries((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    );
  }, []);

  const createCalendarEvent = useCallback(async (event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> => {
    const source = event.source || 'manual';
    const sourceTag = `from:${source}`;
    const tags = event.tags ? [...event.tags] : [];
    if (!tags.includes(sourceTag)) tags.push(sourceTag);
    const created = await calendarStorage.create({ ...event, tags });
    setCalendarEvents((prev) => [...prev, created].sort((a, b) => a.startTime - b.startTime));
    runEntityCreatedTriggers('event');

    if (event.attendees && event.attendees.length > 0) {
      try {
        const { addLink } = await import('@/lib/entityLinks');
        const allContacts = await crmStorage.getAll();
        for (const attendee of event.attendees) {
          const attendeeLower = attendee.toLowerCase().trim();
          const attendeeParts = attendeeLower.split(/\s+/);
          const matched = allContacts.find(c => {
            const contactParts = c.name.toLowerCase().split(/\s+/);
            if (contactParts[0] === attendeeParts[0] && attendeeParts.length > 1 && contactParts.length > 1 && contactParts[1][0] === attendeeParts[1][0]) return true;
            if (contactParts[0] === attendeeParts[0] && contactParts.length === 1) return true;
            return c.name.toLowerCase() === attendeeLower;
          });
          if (matched) {
            await addLink('calendar', created.id, 'contact', matched.id, 'mentions');
          }
        }
      } catch {}
    }
    return created;
  }, [runEntityCreatedTriggers]);

  const updateCalendarEvent = useCallback(async (id: string, updates: Partial<CalendarEvent>) => {
    await calendarStorage.update(id, updates);
    setCalendarEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)).sort((a, b) => a.startTime - b.startTime),
    );
  }, []);

  const deleteCalendarEvent = useCallback(async (id: string) => {
    await calendarStorage.remove(id);
    setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
    try { const { removeLinksFor } = await import('@/lib/entityLinks'); await removeLinksFor('calendar', id); } catch {}
  }, []);

  const createCRMContact = useCallback(async (contact: Omit<CRMContact, 'id' | 'createdAt' | 'interactions'>) => {
    const created = await crmStorage.create(contact);
    setCrmContacts((prev) => [created, ...prev]);
  }, []);

  const updateCRMContact = useCallback(async (id: string, updates: Partial<CRMContact>) => {
    await crmStorage.update(id, updates);
    setCrmContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  }, []);

  const deleteCRMContact = useCallback(async (id: string) => {
    await crmStorage.remove(id);
    setCrmContacts((prev) => prev.filter((c) => c.id !== id));
    try { const { removeLinksFor } = await import('@/lib/entityLinks'); await removeLinksFor('contact', id); } catch {}
  }, []);

  const addCRMInteraction = useCallback(async (contactId: string, interaction: Omit<CRMInteraction, 'id' | 'contactId'>) => {
    const entry = await crmStorage.addInteraction(contactId, interaction);
    setCrmContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? { ...c, interactions: [...c.interactions, entry], lastInteraction: entry.timestamp }
          : c,
      ),
    );
  }, []);

  const setBiometricEnabledFn = useCallback(async (val: boolean) => {
    await settingsStorage.setBiometricEnabled(val);
    setBiometricEnabledState(val);
  }, []);

  const setHasOnboardedFn = useCallback(async (val: boolean) => {
    await settingsStorage.setHasOnboarded(val);
    setHasOnboardedState(val);
  }, []);

  const connectGateway = useCallback(async (url: string, token: string) => {
    await gateway.connect(url, token);
  }, [gateway]);

  const disconnectGateway = useCallback(() => {
    gateway.disconnect();
  }, [gateway]);

  const sendGatewayChat = useCallback(async (message: string, sessionKey = 'agent:main:main') => {
    await gateway.sendChat(message, sessionKey);
  }, [gateway]);

  const fetchGatewaySessions = useCallback(async () => {
    return gateway.fetchSessions();
  }, [gateway]);

  const fetchGatewaySessionHistory = useCallback(async (sessionKey: string) => {
    return gateway.fetchSessionHistory(sessionKey);
  }, [gateway]);

  const fetchGatewayMemory = useCallback(async () => {
    return gateway.fetchMemory();
  }, [gateway]);

  const addInboxItem = useCallback(async (rawText: string, source: 'braindump' | 'voice' = 'braindump', parsed?: { parsedTitle: string; parsedCategory: 'task' | 'event' | 'note'; parsedPriority: 'low' | 'medium' | 'high' | 'urgent'; parsedDueDate?: number }): Promise<InboxItem> => {
    const item = await inboxStorage.add({
      rawText,
      status: 'pending',
      source,
      parsedTitle: parsed?.parsedTitle,
      parsedCategory: parsed?.parsedCategory,
      parsedPriority: parsed?.parsedPriority,
      parsedDueDate: parsed?.parsedDueDate,
    });
    setInboxItems((prev) => [item, ...prev]);
    return item;
  }, []);

  const updateInboxItem = useCallback(async (id: string, updates: Partial<InboxItem>) => {
    await inboxStorage.update(id, updates);
    setInboxItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    );
  }, []);

  const deleteInboxItem = useCallback(async (id: string) => {
    await inboxStorage.remove(id);
    setInboxItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearInbox = useCallback(async () => {
    await inboxStorage.clear();
    setInboxItems([]);
  }, []);

  const value = useMemo(
    () => ({
      connections,
      activeConnection,
      addConnection,
      removeConnection,
      setActiveConnection: setActiveConnectionFn,
      conversations,
      createConversation,
      updateConversation,
      deleteConversation,
      getMessages,
      sendMessage,
      tasks,
      createTask,
      updateTask,
      deleteTask,
      memoryEntries,
      createMemoryEntry,
      deleteMemoryEntry,
      searchMemory,
      updateMemoryEntry,
      calendarEvents,
      createCalendarEvent,
      updateCalendarEvent,
      deleteCalendarEvent,
      crmContacts,
      createCRMContact,
      updateCRMContact,
      deleteCRMContact,
      addCRMInteraction,
      biometricEnabled,
      setBiometricEnabled: setBiometricEnabledFn,
      hasOnboarded,
      setHasOnboarded: setHasOnboardedFn,
      isLoading,
      refreshAll: loadAll,
      gateway,
      gatewayStatus,
      gatewayInfo,
      gatewaySessions,
      gatewayMemoryFiles,
      connectGateway,
      disconnectGateway,
      sendGatewayChat,
      fetchGatewaySessions,
      fetchGatewaySessionHistory,
      fetchGatewayMemory,
      streamingText,
      isStreaming,
      inboxItems,
      addInboxItem,
      updateInboxItem,
      deleteInboxItem,
      clearInbox,
    }),
    [
      connections, activeConnection, addConnection, removeConnection,
      setActiveConnectionFn, conversations, createConversation, updateConversation,
      deleteConversation, getMessages, sendMessage, tasks, createTask,
      updateTask, deleteTask, memoryEntries, createMemoryEntry, deleteMemoryEntry, searchMemory, updateMemoryEntry,
      calendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
      crmContacts, createCRMContact, updateCRMContact, deleteCRMContact, addCRMInteraction,
      biometricEnabled, setBiometricEnabledFn, hasOnboarded,
      setHasOnboardedFn, isLoading, loadAll,
      gateway, gatewayStatus, gatewayInfo, gatewaySessions, gatewayMemoryFiles,
      connectGateway, disconnectGateway, sendGatewayChat,
      fetchGatewaySessions, fetchGatewaySessionHistory, fetchGatewayMemory,
      streamingText, isStreaming,
      inboxItems, addInboxItem, updateInboxItem, deleteInboxItem, clearInbox,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
