import type { Express } from "express";
import { createServer, type Server } from "node:http";

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  const pairingCodes = new Map<string, { url: string; token: string; name: string; expiresAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [code, data] of pairingCodes) {
      if (data.expiresAt < now) pairingCodes.delete(code);
    }
  }, 60000);

  function generatePairCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  app.post('/api/pair/register', (req: any, res: any) => {
    const { url, token, name } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url is required' });
    const code = generatePairCode();
    pairingCodes.set(code, {
      url,
      token: token || '',
      name: name || 'OpenClaw Gateway',
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    res.json({ code, expiresIn: 600 });
  });

  app.get('/api/pair/lookup/:code', (req: any, res: any) => {
    const code = (req.params.code || '').toUpperCase().trim();
    const data = pairingCodes.get(code);
    if (!data) return res.status(404).json({ error: 'Invalid or expired pairing code' });
    if (data.expiresAt < Date.now()) {
      pairingCodes.delete(code);
      return res.status(410).json({ error: 'Pairing code expired' });
    }
    pairingCodes.delete(code);
    res.json({ url: data.url, token: data.token, name: data.name });
  });

  app.use((req: any, res: any, next: any) => {
    if (!req.path.startsWith('/api')) return next();
    res.status(404).json({ error: 'Not found' });
  });

  const httpServer = createServer(app);

  return httpServer;
}
