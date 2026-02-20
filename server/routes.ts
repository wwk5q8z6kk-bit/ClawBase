import type { Express } from "express";
import { createServer, type Server } from "node:http";
import createRateLimit from "express-rate-limit";
import { setupRelay } from "./relay";

export async function registerRoutes(app: Express): Promise<Server> {
  const relayLimiter = createRateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  app.use('/api/relay', relayLimiter);

  const httpServer = createServer(app);

  setupRelay(app, httpServer);

  app.use((req: any, res: any, next: any) => {
    if (!req.path.startsWith('/api')) return next();
    res.status(404).json({ error: 'Not found' });
  });

  return httpServer;
}
