import { Server } from 'http';
import { setupMobileWss } from './mobile-wss';
import { setupApiRoutes } from './api';

export function setupRelay(app: any, httpServer: Server) {
  // 1. Setup Mobile WebSockets attached to the httpServer
  setupMobileWss(httpServer);

  // 2. Setup the Express HTTP routes
  setupApiRoutes(app);
}
