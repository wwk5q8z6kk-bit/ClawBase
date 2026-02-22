import { Platform } from 'react-native';

export interface GatewayHandshakeInfo {
  name?: string;
  agentName?: string;
  version?: string;
  model?: string;
}

export interface GatewayHandshakeResult {
  valid: boolean;
  info?: GatewayHandshakeInfo;
  authError?: string;
  error?: string;
}

interface GatewayHandshakeOptions {
  token?: string;
  timeoutMs?: number;
}

function isLocalAddress(host: string): boolean {
  const h = host.replace(/:\d+$/, '');
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h) || h.endsWith('.local');
}

function buildWsUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url.startsWith('http') && !url.startsWith('ws')) {
    const scheme = isLocalAddress(url) ? 'ws://' : 'wss://';
    url = scheme + url;
  }

  url = url.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  const hasPort = /:\d+(\/|$)/.test(url.replace(/^wss?:\/\//, ''));
  if (!hasPort) url += ':18789';
  return url.replace(/\/$/, '');
}

function extractHandshakeInfo(payload: any): GatewayHandshakeInfo | undefined {
  const gateway = payload?.gateway || payload?.info || payload;
  if (!gateway || typeof gateway !== 'object') return undefined;
  const name = typeof gateway.name === 'string' ? gateway.name : undefined;
  const agentName = typeof gateway.agentName === 'string' ? gateway.agentName : undefined;
  const version = typeof gateway.version === 'string' ? gateway.version : undefined;
  const model = typeof gateway.model === 'string' ? gateway.model : undefined;
  if (!name && !agentName && !version && !model) return undefined;
  return { name, agentName, version, model };
}

function closeSocketSafely(socket: WebSocket | null) {
  if (!socket) return;
  try {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  } catch {}
}

export async function validateGatewayHandshake(
  rawUrl: string,
  options?: GatewayHandshakeOptions,
): Promise<GatewayHandshakeResult> {
  const wsUrl = buildWsUrl(rawUrl);
  const timeoutMs = options?.timeoutMs ?? 5000;
  const token = options?.token?.trim();

  return new Promise((resolve) => {
    let socket: WebSocket | null = null;
    let done = false;
    let requestId = `clawbase-probe-${Date.now().toString()}-${Math.random().toString(36).substr(2, 9)}`;

    const finish = (result: GatewayHandshakeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      closeSocketSafely(socket);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finish({ valid: false, error: 'Server reachable, but no OpenClaw handshake was completed' });
    }, timeoutMs);

    const sendConnect = (nonce?: string) => {
      const auth: Record<string, string> = {};
      if (token) auth.token = token;
      if (nonce) auth.nonce = nonce;

      const connectMsg = {
        type: 'req',
        id: requestId,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'clawbase-validation',
            version: '2.0.0',
            platform: Platform.OS,
            mode: 'probe',
          },
          role: 'operator',
          scopes: ['operator.read'],
          auth,
          locale: 'en-US',
          userAgent: 'ClawBase-Probe/2.0.0',
        },
      };

      socket?.send(JSON.stringify(connectMsg));
    };

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      clearTimeout(timeout);
      resolve({ valid: false, error: 'Could not open WebSocket connection' });
      return;
    }

    socket.onopen = () => {
      sendConnect();
    };

    socket.onmessage = (event) => {
      try {
        const data = typeof event.data === 'string' ? event.data : '';
        if (!data) return;
        const msg = JSON.parse(data);

        // Handle res type messages (protocol v3)
        if (msg.type === 'res') {
          if (msg.ok === true && msg.payload?.type === 'hello-ok') {
            finish({ valid: true, info: extractHandshakeInfo(msg.payload) });
            return;
          }
          if (msg.ok === false) {
            const message = typeof msg.payload?.message === 'string'
              ? msg.payload.message
              : typeof msg.payload?.reason === 'string'
                ? msg.payload.reason
                : 'Handshake was rejected';
            finish({
              valid: true,
              info: extractHandshakeInfo(msg.payload),
              authError: message,
            });
            return;
          }
          return;
        }

        // Handle event type messages
        if (msg.type === 'event') {
          if (msg.event === 'connect.challenge') {
            const nonce = typeof msg.payload?.nonce === 'string' ? msg.payload.nonce : undefined;
            sendConnect(nonce);
            return;
          }
          if (msg.event === 'pairing.required') {
            finish({ valid: true, info: extractHandshakeInfo(msg.payload) });
            return;
          }
        }
      } catch {}
    };

    socket.onerror = () => {
      // Wait for close/timeout to avoid misclassifying transient socket errors.
    };

    socket.onclose = (event) => {
      if (done) return;
      const code = typeof event.code === 'number' ? ` (code ${event.code})` : '';
      finish({ valid: false, error: `Gateway closed connection before handshake completed${code}` });
    };
  });
}
