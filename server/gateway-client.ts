import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { state, addAudit, broadcastToMobile, sendToGateway } from './state';
import { PING_INTERVAL, RPC_TIMEOUT } from './auth';
import { sendPushNotification } from './push';

export function rpc(method: string, params?: any, timeout = RPC_TIMEOUT): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
            state.pendingRPCs.delete(id);
            reject(new Error(`RPC timeout: ${method}`));
        }, timeout);

        state.pendingRPCs.set(id, { resolve, reject, timer });
        sendToGateway({ jsonrpc: '2.0', id, method, params });
    });
}

export function handleGatewayMessage(raw: string) {
    try {
        const data = JSON.parse(raw);

        // Track connection start
        if (data.type === 'hello') {
            console.log(`[Relay] Connection start tracked`);
            broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus, gatewayInfo: state.gatewayInfo });
            return;
        }

        if (data.type === 'challenge') {
            handleChallenge(data);
            return;
        }

        if (data.type === 'hello_ok') {
            handleHelloOk(data);
            Object.assign(state.gatewayInfo, data);
            broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus, gatewayInfo: state.gatewayInfo });
            return;
        }

        if (data.type === 'hello_error') {
            handleHelloError(data);
            return;
        }

        if (data.jsonrpc === '2.0') {
            if (data.id !== undefined && (data.result !== undefined || data.error !== undefined)) {
                const idStr = String(data.id);
                const pend = state.pendingRPCs.get(idStr);
                if (pend) {
                    clearTimeout(pend.timer);
                    state.pendingRPCs.delete(idStr);
                    if (data.error) pend.reject(data.error);
                    else pend.resolve(data.result);
                }
                return;
            }

            if (data.method && !data.id) {
                if (data.method === 'notification' || data.event === 'notification') {
                    const payload = data.params || data.data || data.payload;
                    if (payload) {
                        sendPushNotification({
                            title: payload.title || 'Meridian',
                            body: payload.body || 'New notification from your agent',
                            data: {
                                approvalId: payload.approvalId,
                                type: payload.type,
                                category: payload.category
                            },
                        });
                    }
                }
                broadcastToMobile(data);
                return;
            }
        }

        if (data.type === 'notification' || data.event === 'notification') {
            const payload = data.data || data.payload || data;
            if (payload) {
                sendPushNotification({
                    title: payload.title || 'Meridian',
                    body: payload.body || 'New notification from your agent',
                    data: {
                        approvalId: payload.approvalId,
                        type: payload.type,
                        category: payload.category
                    },
                });
            }
        }

        broadcastToMobile(data);
    } catch (err) {
        console.error('[Relay] Error processing gateway message:', err);
    }
}

function handleChallenge(payload: any) {
    state.gatewayStatus = 'authenticating';
    broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus });
    sendToGateway({
        type: 'challenge_response',
        token: state.gatewayConfig?.token || '',
    });
}

function handleHelloOk(payload: any) {
    state.gatewayStatus = 'connected';
    state.reconnectAttempts = 0;
    console.log('[Relay] Gateway handshake complete.');
    broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus });
    addAudit('system', 'gateway_handshake_success', 'success');
    startPing();

    rpc('mobile_connect').catch((err) =>
        console.warn('[Relay] Failed to optionally register mobile_connect:', err),
    );
}

function handleHelloError(payload: any) {
    state.gatewayStatus = 'error';
    broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus });
    addAudit('system', 'gateway_handshake_error', 'error', payload.error || 'Unknown error');
    console.error('[Relay] Gateway hello error:', payload.error);
}

function startPing() {
    stopPing();
    state.pingInterval = setInterval(() => {
        sendToGateway({ type: 'ping' });
    }, PING_INTERVAL);
}

function stopPing() {
    if (state.pingInterval) {
        clearInterval(state.pingInterval);
        state.pingInterval = null;
    }
}

export function scheduleReconnect() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);

    if (state.reconnectAttempts < state.maxReconnectAttempts) {
        state.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
        console.log(`[Relay] Scheduling reconnect attempt ${state.reconnectAttempts} in ${delay}ms`);
        state.reconnectTimer = setTimeout(connectToGateway, delay);
    } else {
        console.log('[Relay] Max reconnect attempts reached. Waiting for manual trigger or active client.');
        state.gatewayStatus = 'disconnected';
        broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus });
    }
}

export function disconnectGateway() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    stopPing();

    for (const [_, pend] of state.pendingRPCs) {
        clearTimeout(pend.timer);
        pend.reject(new Error('Gateway disconnected'));
    }
    state.pendingRPCs.clear();

    if (state.gatewayWs) {
        const ws = state.gatewayWs;
        state.gatewayWs = null;
        ws.close(1000, 'Relay shutting down connection');
    }

    state.gatewayStatus = 'disconnected';
    state.gatewayInfo = {};
    broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus, gatewayInfo: {} });
    console.log('[Relay] Gateway disconnected manually');
}

export function connectToGateway() {
    if (!state.gatewayConfig || !state.gatewayConfig.url) return;

    if (state.gatewayWs) {
        state.gatewayWs.close();
        state.gatewayWs = null;
    }

    state.gatewayStatus = 'connecting';
    broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus });
    console.log(`[Relay] Connecting to gateway at ${state.gatewayConfig.url}...`);

    const ws = new WebSocket(state.gatewayConfig.url, {
        headers: {
            'User-Agent': 'Meridian Relay 1.0',
        },
    });
    state.gatewayWs = ws;

    ws.on('open', () => {
        console.log('[Relay] Raw TCP connection to Gateway opened. Waiting for challenge...');
        state.gatewayStatus = 'authenticating';
        broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus });
    });

    ws.on('message', (data: WebSocket.Data) => {
        handleGatewayMessage(data.toString());
    });

    ws.on('error', (err: any) => {
        console.error('[Relay] Gateway connection error:', err.message);
        if (state.gatewayWs === ws) {
            state.gatewayStatus = 'error';
            broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus });
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[Relay] Gateway connection closed: ${code} ${reason}`);
        stopPing();

        for (const [_, pend] of state.pendingRPCs) {
            clearTimeout(pend.timer);
            pend.reject(new Error('Gateway disconnected'));
        }
        state.pendingRPCs.clear();

        if (state.gatewayWs === ws) {
            state.gatewayWs = null;
            if (state.gatewayStatus !== 'disconnected' && state.gatewayStatus !== 'error') {
                state.gatewayStatus = 'disconnected';
            }
            broadcastToMobile({ type: 'relay_status', status: state.gatewayStatus });

            if (state.mobileClients.size > 0 || state.reconnectAttempts < state.maxReconnectAttempts) {
                scheduleReconnect();
            }
        }
    });
}
