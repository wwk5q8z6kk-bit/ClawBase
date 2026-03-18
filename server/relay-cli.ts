import express from 'express';
import { createServer } from 'http';
import { setupRelay } from './relay';
import { state } from './state';
import 'dotenv/config';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS setup for mobile connections
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Setup API and WebSockets
const httpServer = createServer(app);
setupRelay(app, httpServer);

const PORT = process.env.RELAY_PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`\n🚀 Meridian Relay CLI started!`);
    console.log(`📡 Listening on http://0.0.0.0:${PORT}`);

    if (process.env.RELAY_SETUP_TOKEN) {
        console.log(`🔒 Setup Token is configured.`);
    } else {
        console.warn(`⚠️  WARNING: RELAY_SETUP_TOKEN is NOT set. Anyone can configure this relay.`);
    }

    if (process.env.SESSION_SECRET) {
        console.log(`🔑 Session Secret is configured.`);
    } else {
        console.warn(`⚠️  WARNING: SESSION_SECRET is NOT set. JWTs will be unsecure!`);
    }
});

// Periodically log status
setInterval(() => {
    console.log(`[Status] Gateway: ${state.gatewayStatus} | Mobile Clients: ${state.mobileClients.size} | Push Tokens: ${state.pushTokens.size}`);
}, 60000);
