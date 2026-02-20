import { randomUUID, timingSafeEqual } from 'crypto';
import { IncomingMessage, Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

const PING_INTERVAL = 15000;
const RPC_TIMEOUT = 30000;
const JWT_EXPIRY = '1h';
const MIN_SESSION_SECRET_LENGTH = 32;
const MAX_AUDIT_ENTRIES = 1000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const RELAY_SETUP_TOKEN = process.env.RELAY_SETUP_TOKEN?.trim() || '';

if (!SESSION_SECRET || SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH) {
  throw new Error(
    `SESSION_SECRET must be configured and at least ${MIN_SESSION_SECRET_LENGTH} characters for relay security.`,
  );
}
const VERIFIED_SESSION_SECRET: string = SESSION_SECRET;

if (process.env.NODE_ENV === 'production' && !RELAY_SETUP_TOKEN) {
  throw new Error('RELAY_SETUP_TOKEN must be configured in production to protect /api/relay/setup.');
}

interface GatewayConfig {
  url: string;
  token: string;
}

interface AuditEntry {
  timestamp: number;
  deviceId: string;
  action: string;
  result: 'success' | 'error';
  details?: string;
}

interface PendingRPC {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

type GatewayStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error';

let gatewayConfig: GatewayConfig | null = null;
let gatewayWs: WebSocket | null = null;
let gatewayStatus: GatewayStatus = 'disconnected';
let gatewayInfo: any = {};
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let pingInterval: ReturnType<typeof setInterval> | null = null;
const pendingRPCs = new Map<string, PendingRPC>();
const auditLog: AuditEntry[] = [];
const mobileClients = new Set<WebSocket>();
const streamBuffers = new Map<string, string>();
const authorizedDevices = new Map<string, { pairingCode: string; authorizedAt: number }>();

// Push notification token storage: deviceId -> { token, platform, lastSeen }
const pushTokens = new Map<string, { expoPushToken: string; platform: string; lastSeen: number }>();

// Track which deviceIds have active WS connections
const activeDeviceConnections = new Map<WebSocket, string>();

function secureEquals(a: string, b: string): boolean {
  const lhs = Buffer.from(a);
  const rhs = Buffer.from(b);
  if (lhs.length !== rhs.length) return false;
  return timingSafeEqual(lhs, rhs);
}

function signDeviceToken(deviceId: string): string {
  return jwt.sign(
    { deviceId, iat: Math.floor(Date.now() / 1000) },
    VERIFIED_SESSION_SECRET,
    { expiresIn: JWT_EXPIRY },
  );
}

function isKnownPairingCode(pairingCode: string): boolean {
  if (!gatewayConfig || !pairingCode) return false;

  if (secureEquals(pairingCode, gatewayConfig.token)) {
    return true;
  }

  for (const device of authorizedDevices.values()) {
    if (secureEquals(pairingCode, device.pairingCode)) {
      return true;
    }
  }

  return false;
}

function addAudit(deviceId: string, action: string, result: 'success' | 'error', details?: string) {
  auditLog.push({ timestamp: Date.now(), deviceId, action, result, details });
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
  }
}

function sendToGateway(msg: any) {
  if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
    gatewayWs.send(JSON.stringify(msg));
  }
}

function broadcastToMobile(msg: any) {
  const data = JSON.stringify(msg);
  for (const client of mobileClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function hasActiveMobileClients(): boolean {
  for (const client of mobileClients) {
    if (client.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

async function sendPushNotification(opts: {
  title: string;
  body: string;
  data?: Record<string, any>;
  categoryId?: string;
  channelId?: string;
}) {
  const tokens: string[] = [];
  for (const entry of pushTokens.values()) {
    tokens.push(entry.expoPushToken);
  }
  if (tokens.length === 0) return;

  const messages = tokens.map((token) => ({
    to: token,
    title: opts.title,
    body: opts.body,
    data: opts.data || {},
    sound: 'default',
    categoryId: opts.categoryId,
    channelId: opts.channelId || 'alerts',
    priority: 'high',
  }));

  try {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const result = await resp.json();
    console.log('[Relay] Push notification sent:', result?.data?.length || 0, 'tickets');
  } catch (err) {
    console.error('[Relay] Failed to send push notification:', err);
  }
}

function rpc(method: string, params?: any, timeout = RPC_TIMEOUT): Promise<any> {
  return new Promise((resolve, reject) => {
    if (gatewayStatus !== 'connected') {
      return reject(new Error('Gateway not connected'));
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      pendingRPCs.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, timeout);
    pendingRPCs.set(id, { resolve, reject, timer });
    sendToGateway({ id, method, params });
  });
}

function handleGatewayMessage(raw: string) {
  try {
    const msg = JSON.parse(raw);

    if (msg.event === 'connect.challenge' || msg.type === 'connect.challenge') {
      handleChallenge(msg.payload || msg);
      return;
    }

    if (msg.event === 'hello-ok' || msg.type === 'hello-ok') {
      handleHelloOk(msg.payload || msg);
      return;
    }

    if (msg.event === 'hello-error' || msg.type === 'hello-error' || msg.event === 'error') {
      handleHelloError(msg.payload || msg);
      return;
    }

    if (msg.id && pendingRPCs.has(msg.id)) {
      const pending = pendingRPCs.get(msg.id)!;
      clearTimeout(pending.timer);
      pendingRPCs.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message || 'RPC error'));
      } else {
        pending.resolve(msg.result || msg.payload || msg.data);
      }
      return;
    }

    if (msg.type === 'message.chunk' || msg.event === 'message.chunk') {
      const data = msg.data || msg.payload || msg;
      const sessionKey = data.sessionKey || 'main';
      const existing = streamBuffers.get(sessionKey) || '';
      const newText = existing + (data.delta || data.text || '');
      streamBuffers.set(sessionKey, newText);
      broadcastToMobile({ type: 'message.chunk', data: { sessionKey, text: newText, delta: data.delta || data.text || '', done: false } });
      return;
    }

    if (msg.type === 'done' || msg.event === 'done') {
      const data = msg.data || msg.payload || msg;
      const sessionKey = data.sessionKey || 'main';
      const fullText = streamBuffers.get(sessionKey) || '';
      streamBuffers.delete(sessionKey);
      broadcastToMobile({ type: 'message.complete', data: { sessionKey, text: fullText, delta: '', done: true, stopReason: data.stopReason || 'end_turn' } });
      return;
    }

    if (msg.type === 'tool_call' || msg.event === 'tool_call' ||
      msg.type === 'presence' || msg.event === 'presence' ||
      msg.type === 'session.update' || msg.event === 'session.update' ||
      msg.type === 'node.invoke' || msg.event === 'node.invoke') {
      broadcastToMobile(msg);
      return;
    }

    // Push notifications for events when no mobile client is connected
    if (msg.type === 'exec.approval.requested' || msg.event === 'exec.approval.requested') {
      broadcastToMobile(msg);
      if (!hasActiveMobileClients()) {
        const data = msg.data || msg.payload || {};
        sendPushNotification({
          title: '🔐 Approval Required',
          body: data.description || data.action || 'Your agent needs your approval for an action',
          data: { approvalId: data.id, type: 'approval' },
          categoryId: 'approval',
          channelId: 'approvals',
        });
      }
      return;
    }

    if (msg.type === 'agent.error' || msg.event === 'agent.error') {
      broadcastToMobile(msg);
      if (!hasActiveMobileClients()) {
        const data = msg.data || msg.payload || {};
        sendPushNotification({
          title: '⚠️ Agent Error',
          body: data.message || 'An error occurred in your agent',
          data: { type: 'error' },
          channelId: 'alerts',
        });
      }
      return;
    }
  } catch { }
}

function handleChallenge(payload: any) {
  if (!gatewayConfig) return;
  const connectMsg: any = {
    type: 'connect',
    minProtocol: 1,
    maxProtocol: 1,
    params: {
      role: 'node',
      scopes: ['operator.chat', 'operator.sessions', 'operator.config', 'node.invoke'],
      device: {
        id: 'relay-server',
        name: 'ClawBase Relay Server',
        type: 'server',
        platform: 'node',
      },
      capabilities: ['chat', 'tasks', 'memory', 'calendar', 'crm', 'canvas', 'notifications'],
      auth: { token: gatewayConfig.token } as any,
    },
  };
  if (payload?.nonce) {
    connectMsg.params.auth.nonce = payload.nonce;
  }
  sendToGateway(connectMsg);
}

function handleHelloOk(payload: any) {
  gatewayStatus = 'connected';
  reconnectAttempts = 0;
  if (payload?.gateway) {
    gatewayInfo = {
      ...gatewayInfo,
      version: payload.gateway.version,
      agentName: payload.gateway.agentName || payload.gateway.name,
      model: payload.gateway.model,
    };
  }
  console.log('[Relay] Gateway connected successfully');
  addAudit('relay-server', 'gateway.connect', 'success');
}

function handleHelloError(payload: any) {
  const msg = payload?.message || payload?.reason || 'Authentication failed';
  gatewayStatus = 'error';
  console.log('[Relay] Gateway auth error:', msg);
  addAudit('relay-server', 'gateway.connect', 'error', msg);
}

function startPing() {
  stopPing();
  pingInterval = setInterval(() => {
    sendToGateway({ type: 'ping' });
  }, PING_INTERVAL);
}

function stopPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

function scheduleReconnect() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.log('[Relay] Max reconnection attempts reached');
    return;
  }
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    if (gatewayStatus === 'disconnected' || gatewayStatus === 'error') {
      connectToGateway();
    }
  }, delay);
}

function disconnectGateway() {
  gatewayStatus = 'disconnected';
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopPing();
  pendingRPCs.forEach(({ reject, timer }) => {
    clearTimeout(timer);
    reject(new Error('Disconnected'));
  });
  pendingRPCs.clear();
  streamBuffers.clear();
  if (gatewayWs) {
    gatewayWs.onclose = null;
    gatewayWs.onerror = null;
    gatewayWs.onmessage = null;
    gatewayWs.close();
    gatewayWs = null;
  }
  reconnectAttempts = 0;
}

function connectToGateway() {
  if (!gatewayConfig) return;
  const savedAttempts = reconnectAttempts;
  if (gatewayWs) {
    gatewayWs.onclose = null;
    gatewayWs.onerror = null;
    gatewayWs.onmessage = null;
    gatewayWs.close();
    gatewayWs = null;
  }
  reconnectAttempts = savedAttempts;

  gatewayStatus = 'connecting';
  let wsUrl = gatewayConfig.url.replace(/\/$/, '');

  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    const isLocal = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(
      wsUrl.replace(/^https?:\/\//, '').replace(/:\d+.*$/, '')
    ) || wsUrl.includes('.local');
    wsUrl = wsUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    if (!wsUrl.startsWith('ws')) {
      wsUrl = (isLocal ? 'ws://' : 'wss://') + wsUrl;
    }
  }

  const hasPort = /:\d+$/.test(wsUrl) || /:\d+\//.test(wsUrl);
  const fullUrl = hasPort ? wsUrl : `${wsUrl}:18789`;

  console.log('[Relay] Connecting to gateway:', fullUrl);

  try {
    gatewayWs = new WebSocket(fullUrl);

    gatewayWs.on('open', () => {
      console.log('[Relay] WebSocket opened, authenticating...');
      gatewayStatus = 'authenticating';
      reconnectAttempts = 0;
      startPing();
    });

    gatewayWs.on('message', (data) => {
      handleGatewayMessage(data.toString());
    });

    gatewayWs.on('error', (err) => {
      console.log('[Relay] WebSocket error:', err.message);
    });

    gatewayWs.on('close', (code, reason) => {
      console.log('[Relay] WebSocket closed, code:', code);
      stopPing();
      const wasConnected = gatewayStatus === 'connected' || gatewayStatus === 'authenticating';
      if (gatewayStatus !== 'disconnected') {
        gatewayStatus = 'disconnected';
      }
      if (wasConnected || reconnectAttempts === 0) {
        scheduleReconnect();
      }
    });
  } catch (err: any) {
    console.log('[Relay] Connection failed:', err.message);
    gatewayStatus = 'error';
    scheduleReconnect();
  }
}

function verifyJwt(token: string): { deviceId: string } | null {
  try {
    const payload = jwt.verify(token, VERIFIED_SESSION_SECRET) as any;
    return { deviceId: payload.deviceId };
  } catch {
    return null;
  }
}

function authenticateSetupRequest(req: any, res: any): boolean {
  // In production, setup auth token is mandatory (enforced at startup too).
  if (!RELAY_SETUP_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'Relay setup is disabled because RELAY_SETUP_TOKEN is not configured.' });
      return false;
    }
    return true;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing setup authorization token' });
    return false;
  }

  const token = authHeader.substring(7);
  if (!secureEquals(token, RELAY_SETUP_TOKEN)) {
    res.status(403).json({ error: 'Invalid setup authorization token' });
    return false;
  }

  return true;
}

function authenticateRequest(req: any, res: any): { deviceId: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return null;
  }
  const token = authHeader.substring(7);
  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
  return payload;
}

export function setupRelay(app: any, httpServer: Server) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/ws/relay')) {
      const params = new URL(url, 'http://localhost').searchParams;
      const token = params.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const payload = verifyJwt(token);
      if (!payload) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      (request as any).deviceId = payload.deviceId;
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const deviceId = (request as any).deviceId || 'unknown';
    console.log('[Relay] Mobile client connected:', deviceId);
    mobileClients.add(ws);
    activeDeviceConnections.set(ws, deviceId);
    addAudit(deviceId, 'ws.connect', 'success');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'chat.send') {
          streamBuffers.delete(msg.params?.sessionKey || 'main');
          sendToGateway({
            method: 'chat.send',
            params: msg.params,
          });
          addAudit(deviceId, 'chat.send', 'success');
        } else if (msg.method === 'device.registerPushToken') {
          const { token, platform } = msg.params || {};
          if (token) {
            pushTokens.set(deviceId, {
              expoPushToken: token,
              platform: platform || 'unknown',
              lastSeen: Date.now(),
            });
            console.log('[Relay] Push token registered for device:', deviceId);
            addAudit(deviceId, 'device.registerPushToken', 'success');
            // Send RPC response
            if (msg.id) {
              ws.send(JSON.stringify({ id: msg.id, result: { ok: true } }));
            }
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else {
          sendToGateway(msg);
        }
      } catch { }
    });

    ws.on('close', () => {
      console.log('[Relay] Mobile client disconnected:', deviceId);
      mobileClients.delete(ws);
      activeDeviceConnections.delete(ws);
      addAudit(deviceId, 'ws.disconnect', 'success');
    });

    ws.send(JSON.stringify({
      type: 'relay.connected',
      data: {
        gatewayStatus,
        gatewayInfo,
      },
    }));
  });

  app.post('/api/relay/setup', (req: any, res: any) => {
    if (!authenticateSetupRequest(req, res)) return;

    const { url, token } = req.body;
    if (!url || !token) {
      return res.status(400).json({ error: 'url and token are required' });
    }

    disconnectGateway();
    gatewayConfig = { url, token };
    connectToGateway();

    addAudit('setup', 'gateway.setup', 'success', url);
    res.json({ ok: true, status: 'connecting' });
  });

  app.get('/api/pair/:code', (req: any, res: any) => {
    const code = typeof req.params.code === 'string' ? req.params.code.trim() : '';
    if (!code) {
      return res.status(400).json({ error: 'Pairing code is required' });
    }

    if (!gatewayConfig) {
      return res.status(503).json({ error: 'Gateway not configured. Call /api/relay/setup first.' });
    }

    // Never allow insecure fallback codes; only configured or previously approved codes pass.
    if (!isKnownPairingCode(code)) {
      addAudit('pair', 'pair.lookup', 'error', 'Invalid pairing code');
      return res.status(401).json({ error: 'Invalid or expired pairing code' });
    }

    addAudit('pair', 'pair.lookup', 'success');
    res.json({
      url: gatewayConfig.url,
      token: gatewayConfig.token,
      name: gatewayInfo?.agentName || gatewayInfo?.name || 'OpenClaw Gateway',
    });
  });

  app.post('/api/relay/auth', (req: any, res: any) => {
    const { deviceId, pairingCode } = req.body;
    const normalizedPairingCode = typeof pairingCode === 'string' ? pairingCode.trim() : '';
    if (!deviceId || !normalizedPairingCode) {
      return res.status(400).json({ error: 'deviceId and pairingCode are required' });
    }

    if (!gatewayConfig) {
      return res.status(503).json({ error: 'Gateway not configured. Call /api/relay/setup first.' });
    }

    if (secureEquals(normalizedPairingCode, gatewayConfig.token)) {
      authorizedDevices.set(deviceId, { pairingCode: normalizedPairingCode, authorizedAt: Date.now() });
      const token = signDeviceToken(deviceId);
      addAudit(deviceId, 'auth.success', 'success');
      return res.json({ ok: true, token, expiresIn: 3600 });
    }

    const device = authorizedDevices.get(deviceId);
    if (device && secureEquals(device.pairingCode, normalizedPairingCode)) {
      const token = signDeviceToken(deviceId);
      addAudit(deviceId, 'auth.success', 'success');
      return res.json({ ok: true, token, expiresIn: 3600 });
    }

    addAudit(deviceId, 'auth.failed', 'error', 'Invalid pairing code');
    res.status(401).json({ error: 'Invalid pairing code' });
  });

  app.get('/api/relay/health', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    const memUsage = process.memoryUsage();
    const health: any = {
      relay: {
        status: 'ok',
        uptime: process.uptime(),
        memory: {
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
        },
        cpu: process.cpuUsage(),
      },
      gateway: {
        status: gatewayStatus,
        connected: gatewayStatus === 'connected',
      },
      mobileClients: mobileClients.size,
    };

    if (gatewayStatus === 'connected') {
      try {
        const gwHealth = await rpc('system.health', {}, 5000).catch(() => null);
        if (gwHealth) {
          health.gateway.health = gwHealth;
        }
      } catch { }
    }

    addAudit(auth.deviceId, 'health.check', 'success');
    res.json(health);
  });

  app.get('/api/relay/status', (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    res.json({
      gateway: {
        status: gatewayStatus,
        connected: gatewayStatus === 'connected',
        url: gatewayConfig ? gatewayConfig.url : null,
        info: gatewayInfo,
      },
      relay: {
        mobileClients: mobileClients.size,
        pendingRPCs: pendingRPCs.size,
      },
    });
  });

  app.get('/api/relay/sessions', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    try {
      const result = await rpc('sessions.list');
      const sessions = Array.isArray(result) ? result : result?.sessions || [];
      addAudit(auth.deviceId, 'sessions.list', 'success');
      res.json({ sessions });
    } catch (e: any) {
      addAudit(auth.deviceId, 'sessions.list', 'error', e.message);
      res.status(502).json({ error: 'Failed to fetch sessions', message: e.message });
    }
  });

  app.get('/api/relay/automations', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    try {
      const result = await rpc('automations.list');
      const automations = Array.isArray(result) ? result : result?.automations || [];
      addAudit(auth.deviceId, 'automations.list', 'success');
      res.json({ automations });
    } catch (e: any) {
      addAudit(auth.deviceId, 'automations.list', 'error', e.message);
      res.status(502).json({ error: 'Failed to fetch automations', message: e.message });
    }
  });

  app.get('/api/relay/approvals', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    try {
      const result = await rpc('automations.approvals');
      const approvals = Array.isArray(result) ? result : result?.approvals || [];
      addAudit(auth.deviceId, 'approvals.list', 'success');
      res.json({ approvals });
    } catch (e: any) {
      addAudit(auth.deviceId, 'approvals.list', 'error', e.message);
      res.status(502).json({ error: 'Failed to fetch approvals', message: e.message });
    }
  });

  app.post('/api/relay/approve/:id', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    try {
      await rpc('automations.approve', { id: req.params.id });
      addAudit(auth.deviceId, 'approve', 'success', req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      addAudit(auth.deviceId, 'approve', 'error', e.message);
      res.status(502).json({ error: 'Failed to approve', message: e.message });
    }
  });

  app.post('/api/relay/deny/:id', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    try {
      await rpc('automations.deny', { id: req.params.id });
      addAudit(auth.deviceId, 'deny', 'success', req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      addAudit(auth.deviceId, 'deny', 'error', e.message);
      res.status(502).json({ error: 'Failed to deny', message: e.message });
    }
  });

  app.post('/api/relay/toggle/:id', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    const { enabled } = req.body;
    try {
      await rpc('automations.toggle', { id: req.params.id, enabled: enabled !== false });
      addAudit(auth.deviceId, 'toggle', 'success', req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      addAudit(auth.deviceId, 'toggle', 'error', e.message);
      res.status(502).json({ error: 'Failed to toggle automation', message: e.message });
    }
  });

  app.get('/api/relay/events', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    const limit = parseInt(req.query.limit as string) || 50;
    try {
      const result = await rpc('events.list', { limit });
      const events = Array.isArray(result) ? result : result?.events || [];
      addAudit(auth.deviceId, 'events.list', 'success');
      res.json({ events });
    } catch (e: any) {
      addAudit(auth.deviceId, 'events.list', 'error', e.message);
      res.status(502).json({ error: 'Failed to fetch events', message: e.message });
    }
  });

  app.get('/api/relay/memory', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    try {
      const files: any[] = [];

      const memoryResult = await rpc('tools.invoke', {
        tool: 'read',
        parameters: { path: 'MEMORY.md' },
      }).catch(() => null);

      if (memoryResult) {
        files.push({
          path: 'MEMORY.md',
          name: 'Long-term Memory',
          content: typeof memoryResult === 'string' ? memoryResult : memoryResult.content || '',
          lastModified: Date.now(),
          type: 'memory',
        });
      }

      const sessionState = await rpc('tools.invoke', {
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

      addAudit(auth.deviceId, 'memory.fetch', 'success');
      res.json({ files });
    } catch (e: any) {
      addAudit(auth.deviceId, 'memory.fetch', 'error', e.message);
      res.status(502).json({ error: 'Failed to fetch memory', message: e.message });
    }
  });

  app.post('/api/relay/chat', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    const { message, sessionKey = 'agent:main:main' } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    try {
      streamBuffers.delete(sessionKey);
      sendToGateway({
        method: 'chat.send',
        params: { sessionKey, message, stream: true },
      });
      addAudit(auth.deviceId, 'chat.send', 'success', sessionKey);
      res.json({ ok: true, sessionKey });
    } catch (e: any) {
      addAudit(auth.deviceId, 'chat.send', 'error', e.message);
      res.status(502).json({ error: 'Failed to send chat', message: e.message });
    }
  });

  app.post('/api/relay/invoke', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    const { tool, parameters } = req.body;
    if (!tool) {
      return res.status(400).json({ error: 'tool is required' });
    }

    try {
      const result = await rpc('tools.invoke', { tool, parameters: parameters || {} });
      addAudit(auth.deviceId, 'invoke', 'success', tool);
      res.json({ result });
    } catch (e: any) {
      addAudit(auth.deviceId, 'invoke', 'error', e.message);
      res.status(502).json({ error: 'Failed to invoke tool', message: e.message });
    }
  });

  app.post('/api/relay/quick-action', async (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    const { action } = req.body;
    const validActions = ['daily-brief', 'health-check', 'sync-memory'];
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
    }

    try {
      let result: any;
      switch (action) {
        case 'daily-brief':
          streamBuffers.delete('agent:main:main');
          sendToGateway({
            method: 'chat.send',
            params: {
              sessionKey: 'agent:main:main',
              message: 'Give me my daily briefing. Summarize my schedule, pending tasks, recent messages, and anything I should know about today.',
              stream: true,
            },
          });
          result = { ok: true, message: 'Daily brief requested' };
          break;
        case 'health-check':
          result = await rpc('system.health', {}, 10000).catch(() => ({ status: 'unknown' }));
          break;
        case 'sync-memory':
          result = await rpc('tools.invoke', {
            tool: 'command',
            parameters: { command: 'memory.sync' },
          }).catch(() => ({ status: 'requested' }));
          break;
      }
      addAudit(auth.deviceId, `quick-action.${action}`, 'success');
      res.json({ ok: true, action, result });
    } catch (e: any) {
      addAudit(auth.deviceId, `quick-action.${action}`, 'error', e.message);
      res.status(502).json({ error: 'Quick action failed', message: e.message });
    }
  });

  app.get('/api/relay/audit', (req: any, res: any) => {
    const auth = authenticateRequest(req, res);
    if (!auth) return;

    const limit = parseInt(req.query.limit as string) || 100;
    const entries = auditLog.slice(-limit).reverse();
    res.json({ entries, total: auditLog.length });
  });
}
