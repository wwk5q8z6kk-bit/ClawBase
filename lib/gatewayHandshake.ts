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
    let challengeSeen = false;

    const finish = (result: GatewayHandshakeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      closeSocketSafely(socket);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      if (challengeSeen) {
        finish({ valid: false, error: 'Gateway did not complete handshake in time' });
      } else {
        finish({ valid: false, error: 'Server reachable, but no OpenClaw handshake challenge was received' });
      }
    }, timeoutMs);

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      clearTimeout(timeout);
      resolve({ valid: false, error: 'Could not open WebSocket connection' });
      return;
    }

    socket.onmessage = (event) => {
      try {
        const data = typeof event.data === 'string' ? event.data : '';
        if (!data) return;
        const msg = JSON.parse(data);
        const type = msg?.event || msg?.type;
        const payload = msg?.payload || msg?.data || msg;

        if (type === 'connect.challenge') {
          challengeSeen = true;

          const auth: Record<string, string> = {};
          if (token) auth.token = token;
          if (typeof payload?.nonce === 'string' && payload.nonce.length > 0) {
            auth.nonce = payload.nonce;
          }

          const connectMsg = {
            type: 'connect',
            minProtocol: 1,
            maxProtocol: 1,
            params: {
              role: 'node',
              scopes: ['operator.chat', 'operator.sessions', 'operator.config', 'node.invoke'],
              device: {
                id: 'clawbase-validation',
                name: 'ClawBase Validation Probe',
                type: 'mobile',
                platform: Platform.OS,
              },
              capabilities: ['chat'],
              auth,
            },
          };

          socket?.send(JSON.stringify(connectMsg));
          return;
        }

        if (!challengeSeen) return;

        if (type === 'hello-ok') {
          finish({ valid: true, info: extractHandshakeInfo(payload) });
          return;
        }

        if (type === 'hello-error' || type === 'error') {
          const message = typeof payload?.message === 'string'
            ? payload.message
            : typeof payload?.reason === 'string'
              ? payload.reason
              : 'Handshake was rejected';
          finish({
            valid: true,
            info: extractHandshakeInfo(payload),
            authError: message,
          });
          return;
        }

        if (type === 'pairing.required' || type === 'pairing.approved') {
          finish({ valid: true, info: extractHandshakeInfo(payload) });
        }
      } catch {}
    };

    socket.onerror = () => {
      // Wait for close/timeout to avoid misclassifying transient socket errors.
    };

    socket.onclose = (event) => {
      if (done) return;
      if (challengeSeen) {
        const code = typeof event.code === 'number' ? ` (code ${event.code})` : '';
        finish({ valid: false, error: `Gateway closed connection before handshake completed${code}` });
        return;
      }
      finish({ valid: false, error: 'Could not reach gateway WebSocket endpoint' });
    };
  });
}
