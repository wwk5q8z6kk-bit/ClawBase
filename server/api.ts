import { state, addAudit, sendToGateway } from './state';
import { authenticateSetupRequest, authenticateRequest, isKnownPairingCode, secureEquals, signDeviceToken } from './auth';
import { connectToGateway, disconnectGateway, rpc } from './gateway-client';

export function setupApiRoutes(app: any) {
    app.post('/api/relay/setup', (req: any, res: any) => {
        if (!authenticateSetupRequest(req, res)) return;

        const { url, token } = req.body;
        if (!url || !token) {
            return res.status(400).json({ error: 'url and token are required' });
        }

        disconnectGateway();
        state.gatewayConfig = { url, token };
        connectToGateway();

        addAudit('setup', 'gateway.setup', 'success', url);
        res.json({ ok: true, status: 'connecting' });
    });

    app.get('/api/pair/:code', (req: any, res: any) => {
        const code = typeof req.params.code === 'string' ? req.params.code.trim() : '';
        if (!code) {
            return res.status(400).json({ error: 'Pairing code is required' });
        }

        if (!state.gatewayConfig) {
            return res.status(503).json({ error: 'Gateway not configured. Call /api/relay/setup first.' });
        }

        // Never allow insecure fallback codes; only configured or previously approved codes pass.
        if (!isKnownPairingCode(code)) {
            addAudit('pair', 'pair.lookup', 'error', 'Invalid pairing code');
            return res.status(401).json({ error: 'Invalid or expired pairing code' });
        }

        addAudit('pair', 'pair.lookup', 'success');
        res.json({
            url: state.gatewayConfig.url,
            token: state.gatewayConfig.token,
            name: state.gatewayInfo?.agentName || state.gatewayInfo?.name || 'OpenClaw Gateway',
        });
    });

    app.post('/api/relay/auth', (req: any, res: any) => {
        const { deviceId, pairingCode } = req.body;
        const normalizedPairingCode = typeof pairingCode === 'string' ? pairingCode.trim() : '';
        if (!deviceId || !normalizedPairingCode) {
            return res.status(400).json({ error: 'deviceId and pairingCode are required' });
        }

        if (!state.gatewayConfig) {
            return res.status(503).json({ error: 'Gateway not configured. Call /api/relay/setup first.' });
        }

        if (secureEquals(normalizedPairingCode, state.gatewayConfig.token)) {
            state.authorizedDevices.set(deviceId, { pairingCode: normalizedPairingCode, authorizedAt: Date.now() });
            const token = signDeviceToken(deviceId);
            addAudit(deviceId, 'auth.success', 'success');
            return res.json({ ok: true, token, expiresIn: 3600 });
        }

        const device = state.authorizedDevices.get(deviceId);
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
                status: state.gatewayStatus,
                connected: state.gatewayStatus === 'connected',
            },
            mobileClients: state.mobileClients.size,
        };

        if (state.gatewayStatus === 'connected') {
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
                status: state.gatewayStatus,
                connected: state.gatewayStatus === 'connected',
                url: state.gatewayConfig ? state.gatewayConfig.url : null,
                info: state.gatewayInfo,
            },
            relay: {
                mobileClients: state.mobileClients.size,
                pendingRPCs: state.pendingRPCs.size,
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

    const resolvedApprovals = new Set<string>();

    app.get('/api/relay/approvals', async (req: any, res: any) => {
        const auth = authenticateRequest(req, res);
        if (!auth) return;

        try {
            const result = await rpc('automations.approvals');
            let approvals = Array.isArray(result) ? result : result?.approvals || [];

            // Filter out approvals that were already acted upon locally
            approvals = approvals.filter((a: any) => !resolvedApprovals.has(a.id));

            // Clear cache of expired or genuinely removed approvals
            const currentIds = new Set(approvals.map((a: any) => a.id));
            for (const id of resolvedApprovals) {
                if (!currentIds.has(id)) {
                    resolvedApprovals.delete(id);
                }
            }

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

        const id = req.params.id;
        resolvedApprovals.add(id);

        try {
            await rpc('automations.approve', { id });
            addAudit(auth.deviceId, 'approve', 'success', id);
            res.json({ ok: true });
        } catch (e: any) {
            resolvedApprovals.delete(id); // Revert optimistic update on failure
            addAudit(auth.deviceId, 'approve', 'error', e.message);
            res.status(502).json({ error: 'Failed to approve', message: e.message });
        }
    });

    app.post('/api/relay/deny/:id', async (req: any, res: any) => {
        const auth = authenticateRequest(req, res);
        if (!auth) return;

        const id = req.params.id;
        resolvedApprovals.add(id);

        try {
            await rpc('automations.deny', { id });
            addAudit(auth.deviceId, 'deny', 'success', id);
            res.json({ ok: true });
        } catch (e: any) {
            resolvedApprovals.delete(id); // Revert optimistic update on failure
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
            state.streamBuffers.delete(sessionKey);
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
                    state.streamBuffers.delete('agent:main:main');
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
        const entries = state.auditLog.slice(-limit).reverse();
        res.json({ entries, total: state.auditLog.length });
    });

    app.post('/api/relay/push-token', (req: any, res: any) => {
        const auth = authenticateRequest(req, res);
        if (!auth) return;

        const { expoPushToken, platform = 'ios' } = req.body;
        if (!expoPushToken || typeof expoPushToken !== 'string') {
            return res.status(400).json({ error: 'expoPushToken is required' });
        }

        state.pushTokens.set(auth.deviceId, {
            expoPushToken,
            platform,
            lastSeen: Date.now(),
        });

        addAudit(auth.deviceId, 'register.push', 'success');
        console.log(`[Relay] Registered push token for device: ${auth.deviceId}`);
        res.json({ ok: true });
    });
}
