import { Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { state, addAudit, broadcastToMobile, sendToGateway } from './state';
import { verifyJwt } from './auth';
import { connectToGateway, disconnectGateway, scheduleReconnect } from './gateway-client';

export function setupMobileWss(httpServer: Server) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
        if (request.url?.startsWith('/api/relay/ws')) {
            const url = new URL(request.url, `http://${request.headers.host}`);
            const token = url.searchParams.get('token');

            if (!token) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            const payload = verifyJwt(token);
            if (!payload?.deviceId) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, payload.deviceId);
            });
        }
    });

    wss.on('connection', (ws: WebSocket, request: any, deviceId: string) => {
        console.log(`[Relay] New mobile client connected. Device ID: ${deviceId}`);

        const existingId = state.activeDeviceConnections.get(ws);
        if (!existingId) {
            state.activeDeviceConnections.set(ws, deviceId);
        }

        state.mobileClients.add(ws);
        addAudit(deviceId, 'mobile_ws_connect', 'success');

        ws.send(JSON.stringify({ type: 'relay_status', status: state.gatewayStatus, gatewayInfo: state.gatewayInfo }));

        // Play back recent output streams immediately on connect
        if (state.streamBuffers.size > 0 && state.gatewayStatus === 'connected') {
            try {
                const streams = Array.from(state.streamBuffers.entries()).map(([streamName, output]) => ({
                    stream: streamName,
                    output
                }));
                ws.send(JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'stream_batch',
                    params: { streams }
                }));
            } catch (err) {
                console.error('[Relay] Error sending buffered streams:', err);
            }
        }

        if (state.gatewayConfig && state.gatewayStatus === 'disconnected') {
            state.reconnectAttempts = 0;
            scheduleReconnect();
        }

        ws.on('message', (message: WebSocket.Data) => {
            try {
                const msgStr = message.toString();

                // Handle ping locally
                if (msgStr === 'ping') {
                    ws.send('pong');
                    return;
                }

                const data = JSON.parse(msgStr);

                // Mobile clients can proxy JSON-RPC through the relay
                if (data.jsonrpc === '2.0') {
                    // Add tracking info if supported by gateway later
                    sendToGateway(data);
                    return;
                }
            } catch (err) {
                console.error('[Relay] Error handling mobile message:', err);
            }
        });

        ws.on('close', () => {
            console.log(`[Relay] Mobile client disconnected. Device ID: ${deviceId}`);
            state.mobileClients.delete(ws);
            state.activeDeviceConnections.delete(ws);
            addAudit(deviceId, 'mobile_ws_disconnect', 'success');

            if (state.mobileClients.size === 0 && state.gatewayStatus === 'error') {
                disconnectGateway();
            }
        });
    });

    return wss;
}
