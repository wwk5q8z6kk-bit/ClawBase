import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import {
  connectionStorage,
  conversationStorage,
  messageStorage,
  taskStorage,
  memoryStorage,
  settingsStorage,
} from './storage';
import type {
  GatewayConnection,
  Conversation,
  ChatMessage,
  Task,
  TaskStatus,
  MemoryEntry,
} from './types';
import * as Crypto from 'expo-crypto';

interface AppContextValue {
  connections: GatewayConnection[];
  activeConnection: GatewayConnection | null;
  addConnection: (name: string, url: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  setActiveConnection: (id: string) => Promise<void>;

  conversations: Conversation[];
  createConversation: (title: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;

  getMessages: (conversationId: string) => Promise<ChatMessage[]>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;

  tasks: Task[];
  createTask: (
    title: string,
    status?: TaskStatus,
    priority?: Task['priority'],
    description?: string,
  ) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  memoryEntries: MemoryEntry[];
  searchMemory: (query: string) => Promise<MemoryEntry[]>;

  biometricEnabled: boolean;
  setBiometricEnabled: (val: boolean) => Promise<void>;
  hasOnboarded: boolean;
  setHasOnboarded: (val: boolean) => Promise<void>;

  isLoading: boolean;
  refreshAll: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<GatewayConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [hasOnboarded, setHasOnboardedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [conns, convos, allTasks, memory, bioEnabled, onboarded, activeId] =
        await Promise.all([
          connectionStorage.getAll(),
          conversationStorage.getAll(),
          taskStorage.getAll(),
          memoryStorage.getAll(),
          settingsStorage.getBiometricEnabled(),
          settingsStorage.getHasOnboarded(),
          connectionStorage.getActive(),
        ]);
      setConnections(conns);
      setConversations(convos);
      setTasks(allTasks);
      setMemoryEntries(memory);
      setBiometricEnabledState(bioEnabled);
      setHasOnboardedState(onboarded);
      setActiveConnectionId(activeId);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === activeConnectionId) || null,
    [connections, activeConnectionId],
  );

  const addConnection = useCallback(
    async (name: string, url: string) => {
      const conn: GatewayConnection = {
        id: Crypto.randomUUID(),
        name,
        url,
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

  const deleteConversation = useCallback(async (id: string) => {
    await conversationStorage.remove(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
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

      await memoryStorage.add({
        type: 'conversation',
        title: userContent.slice(0, 50),
        content: response,
        source: 'chat',
      });

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

      await simulateResponse(conversationId, content);
    },
    [conversations, simulateResponse],
  );

  const createTask = useCallback(
    async (
      title: string,
      status: TaskStatus = 'todo',
      priority: Task['priority'] = 'medium',
      description?: string,
    ) => {
      const task = await taskStorage.create(title, status, priority, description);
      setTasks((prev) => [...prev, task]);
    },
    [],
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
  }, []);

  const searchMemory = useCallback(async (query: string) => {
    if (!query.trim()) return memoryStorage.getAll();
    return memoryStorage.search(query);
  }, []);

  const setBiometricEnabledFn = useCallback(async (val: boolean) => {
    await settingsStorage.setBiometricEnabled(val);
    setBiometricEnabledState(val);
  }, []);

  const setHasOnboardedFn = useCallback(async (val: boolean) => {
    await settingsStorage.setHasOnboarded(val);
    setHasOnboardedState(val);
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
      deleteConversation,
      getMessages,
      sendMessage,
      tasks,
      createTask,
      updateTask,
      deleteTask,
      memoryEntries,
      searchMemory,
      biometricEnabled,
      setBiometricEnabled: setBiometricEnabledFn,
      hasOnboarded,
      setHasOnboarded: setHasOnboardedFn,
      isLoading,
      refreshAll: loadAll,
    }),
    [
      connections, activeConnection, addConnection, removeConnection,
      setActiveConnectionFn, conversations, createConversation,
      deleteConversation, getMessages, sendMessage, tasks, createTask,
      updateTask, deleteTask, memoryEntries, searchMemory,
      biometricEnabled, setBiometricEnabledFn, hasOnboarded,
      setHasOnboardedFn, isLoading, loadAll,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
