import WebSocket from 'ws';

export interface GatewayConfig {
    url: string;
    token: string;
}

export interface AuditEntry {
    timestamp: number;
    deviceId: string;
    action: string;
    result: 'success' | 'error';
    details?: string;
}

export interface PendingRPC {
    resolve: (v: any) => void;
    reject: (e: any) => void;
    timer: ReturnType<typeof setTimeout>;
}

export type GatewayStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error';

export const state = {
    gatewayConfig: null as GatewayConfig | null,
    gatewayWs: null as WebSocket | null,
    gatewayStatus: 'disconnected' as GatewayStatus,
    gatewayInfo: {} as any,

    reconnectTimer: null as ReturnType<typeof setTimeout> | null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    pingInterval: null as ReturnType<typeof setInterval> | null,

    pendingRPCs: new Map<string, PendingRPC>(),
    auditLog: [] as AuditEntry[],
    mobileClients: new Set<WebSocket>(),
    streamBuffers: new Map<string, string>(),
    authorizedDevices: new Map<string, { pairingCode: string; authorizedAt: number }>(),

    // Push notification token storage: deviceId -> { token, platform, lastSeen }
    pushTokens: new Map<string, { expoPushToken: string; platform: string; lastSeen: number }>(),

    // Track which deviceIds have active WS connections
    activeDeviceConnections: new Map<WebSocket, string>(),
};

const MAX_AUDIT_ENTRIES = 1000;

export function addAudit(deviceId: string, action: string, result: 'success' | 'error', details?: string) {
    state.auditLog.push({ timestamp: Date.now(), deviceId, action, result, details });
    if (state.auditLog.length > MAX_AUDIT_ENTRIES) {
        state.auditLog.splice(0, state.auditLog.length - MAX_AUDIT_ENTRIES);
    }
}

export function hasActiveMobileClients(): boolean {
    for (const client of state.mobileClients) {
        if (client.readyState === WebSocket.OPEN) return true;
    }
    return false;
}

export function broadcastToMobile(msg: any) {
    const data = JSON.stringify(msg);
    for (const client of state.mobileClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    }
}

export function sendToGateway(msg: any) {
    if (state.gatewayWs && state.gatewayWs.readyState === WebSocket.OPEN) {
        state.gatewayWs.send(JSON.stringify(msg));
    }
}
