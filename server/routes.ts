import type { Express } from "express";
import { createServer, type Server } from "node:http";

export async function registerRoutes(app: Express): Promise<Server> {

  app.use((req: any, res: any, next: any) => {
    if (!req.path.startsWith('/api')) return next();
    res.status(404).json({ error: 'Not found' });
  });

  const httpServer = createServer(app);

  return httpServer;
}
