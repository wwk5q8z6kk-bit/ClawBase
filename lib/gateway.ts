import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type GatewayStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error' | 'pairing';

export interface GatewaySession {
  sessionKey: string;
  agentId: string;
  channelType: string;
  channelId: string;
  label: string;
  messageCount: number;
  lastActivity: number;
  isActive: boolean;
}

export interface GatewaySessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
}

export interface GatewayInfo {
  version?: string;
  uptime?: number;
  channels: GatewayChannel[];
  activeSessionCount: number;
  totalSessions: number;
  skills: string[];
  model?: string;
  agentName?: string;
}

export interface GatewayChannel {
  type: string;
  status: 'active' | 'inactive' | 'error';
  label: string;
  accountCount?: number;
}

export interface GatewayMemoryFile {
  path: string;
  name: string;
  content: string;
  lastModified: number;
  type: 'memory' | 'session-state' | 'daily-log' | 'topic';
}

export interface StreamChunk {
  sessionKey: string;
  text: string;
  delta: string;
  done: boolean;
  stopReason?: string;
}

export type GatewayEventType =
  | 'status_change'
  | 'message_chunk'
  | 'message_complete'
  | 'session_update'
  | 'presence'
  | 'tool_call'
  | 'node_invoke'
  | 'error'
  | 'gateway_info'
  | 'sessions_list'
  | 'session_history'
  | 'memory_data'
  | 'chat_response';

export interface GatewayEvent {
  type: GatewayEventType;
  data: any;
}

type EventHandler = (event: GatewayEvent) => void;

const DEVICE_TOKEN_KEY = '@clawbase:device_token';
const DEVICE_ID_KEY = '@clawbase:device_id';

async function getOrCreateDeviceId(): Promise<string> {
  try {
    if (Platform.OS !== 'web') {
      const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (existing) return existing;
      const id = Crypto.randomUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
      return id;
    }
  } catch {}
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

async function getStoredDeviceToken(): Promise<string | null> {
  try {
    if (Platform.OS !== 'web') {
      return await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
    }
  } catch {}
  return AsyncStorage.getItem(DEVICE_TOKEN_KEY);
}

async function storeDeviceToken(token: string): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, token);
      return;
    }
  } catch {}
  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
}

export class OpenClawGateway {
  private ws: WebSocket | null = null;
  private url: string = '';
  private token: string = '';
  private deviceId: string = '';
  private deviceToken: string | null = null;
  private status: GatewayStatus = 'disconnected';
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pendingRequests: Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> }> = new Map();
  private gatewayInfo: GatewayInfo = {
    channels: [],
    activeSessionCount: 0,
    totalSessions: 0,
    skills: [],
  };
  private streamBuffer: Map<string, string> = new Map();

  getStatus(): GatewayStatus {
    return this.status;
  }

  getInfo(): GatewayInfo {
    return this.gatewayInfo;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  private emit(type: GatewayEventType, data: any) {
    const event: GatewayEvent = { type, data };
    this.listeners.get(type)?.forEach((h) => h(event));
    this.listeners.get('*')?.forEach((h) => h(event));
  }

  private setStatus(status: GatewayStatus) {
    this.status = status;
    this.emit('status_change', { status });
  }

  async connect(url: string, token: string): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }

    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.reconnectAttempts = 0;
    this.deviceId = await getOrCreateDeviceId();
    this.deviceToken = await getStoredDeviceToken();

    await this.doConnect();
  }

  private async doConnect(): Promise<void> {
    this.setStatus('connecting');

    try {
      let wsUrl = this.url;
      if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        const isLocal = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(
          wsUrl.replace(/^https?:\/\//, '').replace(/:\d+.*$/, '')
        ) || wsUrl.includes('.local');
        wsUrl = wsUrl
          .replace(/^http:\/\//, 'ws://')
          .replace(/^https:\/\//, 'wss://');
        if (!wsUrl.startsWith('ws')) {
          wsUrl = (isLocal ? 'ws://' : 'wss://') + wsUrl;
        }
      }
      const hasPort = /:\d+$/.test(wsUrl) || /:\d+\//.test(wsUrl);
      const fullUrl = hasPort ? wsUrl : `${wsUrl}:18789`;

      console.log('[Gateway] Connecting to:', fullUrl);

      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        console.log('[Gateway] WebSocket opened, authenticating...');
        this.setStatus('authenticating');
        this.reconnectAttempts = 0;
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (_event) => {
        console.log('[Gateway] WebSocket error');
        this.emit('error', { message: 'WebSocket connection error' });
      };

      this.ws.onclose = (event) => {
        console.log('[Gateway] WebSocket closed, code:', event.code, 'reason:', event.reason);
        this.stopPing();
        const wasConnected = this.status === 'connected' || this.status === 'authenticating' || this.status === 'pairing';
        if (this.status !== 'disconnected') {
          this.setStatus('disconnected');
        }
        if (wasConnected || this.reconnectAttempts === 0) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.log('[Gateway] Connection failed:', err);
      this.setStatus('error');
      this.emit('error', { message: `Connection failed: ${err}` });
      this.scheduleReconnect();
    }
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      console.log('[Gateway] Message received:', msg.type || msg.event || 'unknown');

      if (msg.event === 'connect.challenge' || msg.type === 'connect.challenge') {
        this.handleChallenge(msg.payload || msg);
        return;
      }

      if (msg.event === 'hello-ok' || msg.type === 'hello-ok') {
        this.handleHelloOk(msg.payload || msg);
        return;
      }

      if (msg.event === 'hello-error' || msg.type === 'hello-error' || msg.event === 'error') {
        this.handleHelloError(msg.payload || msg);
        return;
      }

      if (msg.event === 'pairing.required' || msg.type === 'pairing.required') {
        this.setStatus('pairing');
        this.emit('status_change', { status: 'pairing', message: 'Approve this device on your gateway' });
        return;
      }

      if (msg.event === 'pairing.approved' || msg.type === 'pairing.approved') {
        this.setStatus('connected');
        this.emit('status_change', { status: 'connected' });
        this.requestGatewayInfo();
        return;
      }

      if (msg.id && this.pendingRequests.has(msg.id)) {
        const pending = this.pendingRequests.get(msg.id)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || 'RPC error'));
        } else {
          pending.resolve(msg.result || msg.payload || msg.data);
        }
        return;
      }

      if (msg.type === 'message.chunk' || msg.event === 'message.chunk') {
        this.handleStreamChunk(msg.data || msg.payload || msg);
        return;
      }

      if (msg.type === 'done' || msg.event === 'done') {
        this.handleStreamDone(msg.data || msg.payload || msg);
        return;
      }

      if (msg.type === 'tool_call' || msg.event === 'tool_call') {
        this.emit('tool_call', msg.data || msg.payload || msg);
        return;
      }

      if (msg.type === 'presence' || msg.event === 'presence') {
        this.emit('presence', msg.data || msg.payload || msg);
        return;
      }

      if (msg.type === 'session.update' || msg.event === 'session.update') {
        this.emit('session_update', msg.data || msg.payload || msg);
        return;
      }

      if (msg.type === 'node.invoke' || msg.event === 'node.invoke') {
        this.handleNodeInvoke(msg);
        return;
      }

    } catch {}
  }

  private handleChallenge(payload: any) {
    const connectMsg: any = {
      type: 'connect',
      minProtocol: 1,
      maxProtocol: 1,
      params: {
        role: 'node',
        scopes: ['operator.chat', 'operator.sessions', 'operator.config', 'node.invoke'],
        device: {
          id: this.deviceId,
          name: 'ClawBase Mobile',
          type: 'mobile',
          platform: Platform.OS,
        },
        capabilities: [
          'chat',
          'tasks',
          'memory',
          'calendar',
          'crm',
          'canvas',
          'notifications',
        ],
        auth: {} as any,
      },
    };

    if (this.deviceToken) {
      connectMsg.params.auth.deviceToken = this.deviceToken;
    } else if (this.token) {
      connectMsg.params.auth.token = this.token;
    }

    if (payload?.nonce) {
      connectMsg.params.auth.nonce = payload.nonce;
    }

    this.send(connectMsg);
  }

  private async handleHelloOk(payload: any) {
    if (payload?.auth?.deviceToken) {
      this.deviceToken = payload.auth.deviceToken;
      await storeDeviceToken(payload.auth.deviceToken);
    }

    this.setStatus('connected');

    if (payload?.gateway) {
      this.gatewayInfo.version = payload.gateway.version;
      this.gatewayInfo.agentName = payload.gateway.agentName || payload.gateway.name;
      this.gatewayInfo.model = payload.gateway.model;
    }

    this.requestGatewayInfo();
  }

  private handleHelloError(payload: any) {
    const msg = payload?.message || payload?.reason || 'Authentication failed';
    this.setStatus('error');
    this.emit('error', { message: msg, code: payload?.code });
  }

  private handleStreamChunk(data: any) {
    const sessionKey = data.sessionKey || 'main';
    const existing = this.streamBuffer.get(sessionKey) || '';
    const newText = existing + (data.delta || data.text || '');
    this.streamBuffer.set(sessionKey, newText);

    this.emit('message_chunk', {
      sessionKey,
      text: newText,
      delta: data.delta || data.text || '',
      done: false,
    } as StreamChunk);
  }

  private handleStreamDone(data: any) {
    const sessionKey = data.sessionKey || 'main';
    const fullText = this.streamBuffer.get(sessionKey) || '';
    this.streamBuffer.delete(sessionKey);

    this.emit('message_complete', {
      sessionKey,
      text: fullText,
      delta: '',
      done: true,
      stopReason: data.stopReason || 'end_turn',
    } as StreamChunk);
  }

  private handleNodeInvoke(msg: any) {
    const command = msg.command || msg.data?.command || '';
    const params = msg.params || msg.data?.params || {};
    const invokeId = msg.id || msg.invokeId;

    this.emit('node_invoke', { command, params, invokeId });

    if (command === 'node.status') {
      this.send({
        type: 'node.invoke.result',
        id: invokeId,
        result: {
          status: 'active',
          platform: Platform.OS,
          capabilities: ['chat', 'tasks', 'memory', 'calendar', 'crm', 'canvas', 'notifications'],
        },
      });
    } else {
      this.send({
        type: 'node.invoke.result',
        id: invokeId,
        result: { acknowledged: true, command },
      });
    }
  }

  private send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private rpc(method: string, params?: any, timeout = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeout);
      this.pendingRequests.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  private requestGatewayInfo() {
    this.fetchSessions().catch(() => {});
    this.fetchConfig().catch(() => {});
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', { message: 'Max reconnection attempts reached' });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (this.status === 'disconnected' || this.status === 'error') {
        this.doConnect();
      }
    }, delay);
  }

  disconnect() {
    this.setStatus('disconnected');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    this.pendingRequests.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error('Disconnected'));
    });
    this.pendingRequests.clear();
    this.streamBuffer.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
  }

  async sendChat(message: string, sessionKey = 'agent:main:main'): Promise<void> {
    if (this.status !== 'connected') {
      throw new Error('Not connected to gateway');
    }

    this.streamBuffer.delete(sessionKey);

    this.send({
      method: 'chat.send',
      params: {
        sessionKey,
        message,
        stream: true,
      },
    });
  }

  async abortChat(runId?: string): Promise<void> {
    this.send({
      method: 'chat.abort',
      params: runId ? { runId } : {},
    });
  }

  async fetchSessions(): Promise<GatewaySession[]> {
    try {
      const result = await this.rpc('sessions.list');
      const sessions: GatewaySession[] = [];

      if (Array.isArray(result)) {
        for (const s of result) {
          sessions.push(this.parseSession(s));
        }
      } else if (result?.sessions) {
        for (const s of result.sessions) {
          sessions.push(this.parseSession(s));
        }
      }

      this.gatewayInfo.totalSessions = sessions.length;
      this.gatewayInfo.activeSessionCount = sessions.filter((s) => s.isActive).length;
      this.emit('sessions_list', sessions);
      return sessions;
    } catch {
      return [];
    }
  }

  private parseSession(s: any): GatewaySession {
    const key = s.sessionKey || s.key || s.id || '';
    const parts = key.split(':');
    return {
      sessionKey: key,
      agentId: parts[1] || 'main',
      channelType: parts[2] || 'direct',
      channelId: parts.slice(3).join(':') || '',
      label: s.label || s.title || this.formatSessionLabel(key),
      messageCount: s.messageCount || s.messages || 0,
      lastActivity: s.lastActivity || s.updatedAt || Date.now(),
      isActive: s.isActive !== undefined ? s.isActive : true,
    };
  }

  private formatSessionLabel(key: string): string {
    const parts = key.split(':');
    if (parts.length < 3) return key;
    const channel = parts[2];
    const id = parts.slice(3).join(':');
    const channelLabels: Record<string, string> = {
      whatsapp: 'WhatsApp',
      telegram: 'Telegram',
      discord: 'Discord',
      slack: 'Slack',
      imessage: 'iMessage',
      signal: 'Signal',
      webchat: 'WebChat',
      main: 'Direct',
      dm: 'Direct',
    };
    const channelLabel = channelLabels[channel] || channel;
    if (id) return `${channelLabel} · ${id}`;
    return channelLabel;
  }

  async fetchSessionHistory(sessionKey: string, limit = 50): Promise<GatewaySessionMessage[]> {
    try {
      const result = await this.rpc('sessions.history', { sessionKey, limit });
      const messages: GatewaySessionMessage[] = [];

      const items = Array.isArray(result) ? result : result?.messages || result?.history || [];
      for (const m of items) {
        messages.push({
          role: m.role || 'assistant',
          content: m.content || m.text || '',
          timestamp: m.timestamp || m.createdAt || Date.now(),
          toolName: m.toolName || m.tool,
        });
      }

      this.emit('session_history', { sessionKey, messages });
      return messages;
    } catch {
      return [];
    }
  }

  async fetchConfig(): Promise<void> {
    try {
      const channelsResult = await this.rpc('config.get', { key: 'channels' }).catch(() => null);
      if (channelsResult) {
        const channels: GatewayChannel[] = [];
        const channelData = typeof channelsResult === 'object' ? channelsResult : {};
        for (const [type, config] of Object.entries(channelData)) {
          if (type === 'default' || !config) continue;
          const cfg = config as any;
          channels.push({
            type,
            status: cfg.enabled !== false ? 'active' : 'inactive',
            label: type.charAt(0).toUpperCase() + type.slice(1),
            accountCount: cfg.accounts ? Object.keys(cfg.accounts).length : undefined,
          });
        }
        this.gatewayInfo.channels = channels;
      }

      const modelResult = await this.rpc('config.get', { key: 'model' }).catch(() => null);
      if (modelResult) {
        this.gatewayInfo.model = typeof modelResult === 'string' ? modelResult : modelResult?.value;
      }

      this.emit('gateway_info', this.gatewayInfo);
    } catch {}
  }

  async fetchMemory(): Promise<GatewayMemoryFile[]> {
    try {
      const result = await this.rpc('tools.invoke', {
        tool: 'read',
        parameters: { path: 'MEMORY.md' },
      });

      const files: GatewayMemoryFile[] = [];

      if (result?.content || typeof result === 'string') {
        files.push({
          path: 'MEMORY.md',
          name: 'Long-term Memory',
          content: typeof result === 'string' ? result : result.content,
          lastModified: Date.now(),
          type: 'memory',
        });
      }

      const sessionState = await this.rpc('tools.invoke', {
        tool: 'read',
        parameters: { path: 'SESSION-STATE.md' },
      }).catch(() => null);

      if (sessionState) {
        files.push({
          path: 'SESSION-STATE.md',
          name: 'Active Context',
          content: typeof sessionState === 'string' ? sessionState : sessionState.content || '',
          lastModified: Date.now(),
          type: 'session-state',
        });
      }

      this.emit('memory_data', files);
      return files;
    } catch {
      return [];
    }
  }

  async requestTunnel(provider: 'cloudflare' | 'tailscale' | 'auto' = 'auto'): Promise<{ url?: string; status: string; error?: string }> {
    try {
      const result = await this.rpc('config.tunnel.start', { provider }, 30000);
      return {
        url: result?.url || result?.publicUrl,
        status: result?.status || 'started',
      };
    } catch (e: any) {
      return { status: 'error', error: e?.message || 'Failed to start tunnel' };
    }
  }

  async getTunnelStatus(): Promise<{ active: boolean; url?: string; provider?: string }> {
    try {
      const result = await this.rpc('config.tunnel.status');
      return {
        active: !!result?.active,
        url: result?.url || result?.publicUrl,
        provider: result?.provider,
      };
    } catch {
      return { active: false };
    }
  }

  async stopTunnel(): Promise<void> {
    try {
      await this.rpc('config.tunnel.stop');
    } catch {}
  }

  async generatePairCode(): Promise<{ code: string; expiresAt: number } | null> {
    try {
      const result = await this.rpc('config.pair.generate');
      return {
        code: result?.code || '',
        expiresAt: result?.expiresAt || Date.now() + 600000,
      };
    } catch {
      return null;
    }
  }

  async fetchAutomations(): Promise<any[]> {
    try {
      const result = await this.rpc('automations.list');
      return Array.isArray(result) ? result : result?.automations || [];
    } catch {
      return [];
    }
  }

  async fetchApprovals(): Promise<any[]> {
    try {
      const result = await this.rpc('automations.approvals');
      return Array.isArray(result) ? result : result?.approvals || [];
    } catch {
      return [];
    }
  }

  async toggleAutomation(id: string, enabled: boolean): Promise<boolean> {
    try {
      await this.rpc('automations.toggle', { id, enabled });
      return true;
    } catch {
      return false;
    }
  }

  async approveAction(id: string): Promise<boolean> {
    try {
      await this.rpc('automations.approve', { id });
      return true;
    } catch {
      return false;
    }
  }

  async denyAction(id: string): Promise<boolean> {
    try {
      await this.rpc('automations.deny', { id });
      return true;
    } catch {
      return false;
    }
  }

  async fetchEvents(limit = 50): Promise<any[]> {
    try {
      const result = await this.rpc('events.list', { limit });
      return Array.isArray(result) ? result : result?.events || [];
    } catch {
      return [];
    }
  }

  async fetchCronOutputs(limit = 10): Promise<any[]> {
    try {
      const result = await this.rpc('automations.outputs', { limit });
      return Array.isArray(result) ? result : result?.outputs || [];
    } catch {
      return [];
    }
  }

  async rebindGateway(bind = '0.0.0.0', port = 18789): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.rpc('config.set', { bind, port }, 10000);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to rebind gateway' };
    }
  }

  async invokeCommand(command: string, params?: Record<string, any>): Promise<any> {
    try {
      return await this.rpc('tools.invoke', {
        tool: 'command',
        parameters: { command, ...params },
      });
    } catch (e: any) {
      return { error: e?.message || 'Command failed' };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const httpUrl = this.url
        .replace(/^ws:\/\//, 'http://')
        .replace(/^wss:\/\//, 'https://');
      const hasPort = /:\d+$/.test(httpUrl) || /:\d+\//.test(httpUrl);
      const healthUrl = hasPort ? `${httpUrl}/healthz` : `${httpUrl}:18789/healthz`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timer);
      return resp.ok;
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  destroy() {
    this.disconnect();
    this.listeners.clear();
  }
}

let gatewayInstance: OpenClawGateway | null = null;

export function getGateway(): OpenClawGateway {
  if (!gatewayInstance) {
    gatewayInstance = new OpenClawGateway();
  }
  return gatewayInstance;
}
