import { timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { state } from './state';

export const PING_INTERVAL = 15000;
export const RPC_TIMEOUT = 30000;
export const JWT_EXPIRY = '1h';
const MIN_SESSION_SECRET_LENGTH = 32;

const SESSION_SECRET = process.env.SESSION_SECRET;
export const RELAY_SETUP_TOKEN = process.env.RELAY_SETUP_TOKEN?.trim() || '';

if (!SESSION_SECRET || SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
        `SESSION_SECRET must be configured and at least ${MIN_SESSION_SECRET_LENGTH} characters for relay security.`,
    );
}

export const VERIFIED_SESSION_SECRET: string = SESSION_SECRET;

if (process.env.NODE_ENV === 'production' && !RELAY_SETUP_TOKEN) {
    throw new Error('RELAY_SETUP_TOKEN must be configured in production to protect /api/relay/setup.');
}

export function secureEquals(a: string, b: string): boolean {
    const lhs = Buffer.from(a);
    const rhs = Buffer.from(b);
    if (lhs.length !== rhs.length) return false;
    return timingSafeEqual(lhs, rhs);
}

export function signDeviceToken(deviceId: string): string {
    return jwt.sign(
        { deviceId, iat: Math.floor(Date.now() / 1000) },
        VERIFIED_SESSION_SECRET,
        { expiresIn: JWT_EXPIRY },
    );
}

export function verifyJwt(token: string): { deviceId: string } | null {
    try {
        const decoded = jwt.verify(token, VERIFIED_SESSION_SECRET) as { deviceId: string };
        return { deviceId: decoded.deviceId };
    } catch (err) {
        return null;
    }
}

export function isKnownPairingCode(pairingCode: string): boolean {
    if (!state.gatewayConfig || !pairingCode) return false;

    if (secureEquals(pairingCode, state.gatewayConfig.token)) {
        return true;
    }

    for (const device of state.authorizedDevices.values()) {
        if (secureEquals(pairingCode, device.pairingCode)) {
            return true;
        }
    }

    return false;
}

export function authenticateSetupRequest(req: any, res: any): boolean {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing setup token' });
        return false;
    }

    const token = authHeader.substring(7);

    if (RELAY_SETUP_TOKEN && secureEquals(token, RELAY_SETUP_TOKEN)) {
        return true;
    }

    const payload = verifyJwt(token);
    if (payload?.deviceId) {
        return true;
    }

    res.status(401).json({ error: 'Invalid setup token or JWT' });
    return false;
}

export function authenticateRequest(req: any, res: any): { deviceId: string } | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing token' });
        return null;
    }
    const token = authHeader.substring(7);
    const payload = verifyJwt(token);
    if (!payload?.deviceId) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return null;
    }
    return payload;
}
