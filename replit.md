# ClawBase

## Overview

ClawBase is a React Native (Expo) mobile companion app for self-hosted OpenClaw AI gateways. It provides a secure interface for managing AI agent interactions, including real-time chat, task/Kanban boards, memory browsing, and gateway connection management. The app connects directly to the user's own OpenClaw Gateway via WebSocket, ensuring data privacy. It targets iOS, Android, and web platforms, with an Express backend server for API support and static serving. The app follows a "lobster" dark theme and is designed for building and deployment from Replit, utilizing Expo cloud builds for native app store distribution.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Mobile App)

- **Framework**: React Native with Expo SDK 54 and Expo Router v6 for file-based routing.
- **Navigation**: Tab-based layout featuring Home, Chat, Workspace (Tasks + Memory), Calendar (Calendar + Activity), and Settings. Hidden routes exist for granular features.
- **State Management**: React Context (`AppContext`) for global state and React Query (`@tanstack/react-query`) for server-state management.
- **Local Storage**: AsyncStorage (`@react-native-async-storage/async-storage`) for persisting local data with a key-prefixed pattern.
- **UI Libraries**: Utilizes `expo-linear-gradient`, `expo-haptics`, `react-native-reanimated`, `react-native-gesture-handler`, and `react-native-keyboard-controller`.
- **Fonts**: Inter font family is used.
- **Security**: `expo-local-authentication` for biometric/PIN lock and `expo-secure-store` for sensitive data.

### Backend (Express Server + Relay)

- **Framework**: Express 5 (TypeScript) acts as a relay server, API proxy, and static file server.
- **Relay Server**: Manages a WebSocket bridge between mobile clients and the OpenClaw gateway, handling JWT authentication, gateway connection management with exponential backoff, message bridging, and streaming. It exposes 16 REST API endpoints, implements rate limiting, and maintains an in-memory audit trail.
- **Storage**: Currently uses in-memory storage, with Drizzle ORM configured for PostgreSQL, though database usage is optional and minimal.

### Database

- **ORM**: Drizzle ORM with PostgreSQL dialect, schema defined in `shared/schema.ts` using `drizzle-zod` for validation. Migrations are handled via `drizzle-kit`. Primarily, app data resides in client-side AsyncStorage.

### Gateway Integration (Protocol v3)

- **WebSocket Client**: `OpenClawGateway` class connects to the user's self-hosted OpenClaw Gateway on port 18789 using Protocol v3. The client sends a connect request as the first WebSocket frame on open, using `{ type: "req", id, method: "connect", params: {...} }` format with `minProtocol: 3, maxProtocol: 3`.
- **Message Format**: All RPC requests use `{ type: "req", id, method, params }`. Responses come as `{ type: "res", id, ok, payload }`. Server events come as `{ type: "event", event, payload }`.
- **Authentication**: Supports gateway token and device token auth. Device tokens are persisted via SecureStore/AsyncStorage and reused on reconnect.
- **RPC Methods**: `sessions.list`, `sessions.history`, `sessions.send` (chat), `agent.cancel` (abort), `config.get`, `system.health`, `automations.list`, `events.list`, `ping`.
- **Health Check**: Uses `/health` endpoint (HTTP GET) for reachability testing.
- **Features**: Supports real-time streaming, session browsing, memory synchronization, automatic re-connection with exponential backoff, an event system, and dashboard widgets for status display.
- **Orchestration**: The app can command the gateway to start/stop tunnels, generate pairing codes, rebind settings, and invoke arbitrary commands.
- **Automations & Events RPC**: Provides methods for managing heartbeat/cron automations and fetching unified timeline events.
- **Zero Relay Architecture**: Direct communication between app and gateway, with pairing codes handled directly by the gateway.
- **Node Registration**: The app registers as a "node" with specific capabilities, and handles `node.invoke` commands from the gateway.

### Pairing System

- **Connection Methods**: Supports QR code scanning, Tailscale/remote URL, gateway pairing code, and manual URL entry.
- **Reachability**: Tests gateway via Protocol v3 WebSocket handshake (sends connect request, waits for hello-ok) before saving connections.
- **Deep Links**: Supports `clawbase://` and `openclaw://` URL schemes.
- **Auto-discovery**: Scans local networks for gateways on port 18789 by probing via Protocol v3 WebSocket handshake.

### Network Discovery

- **Gateway Scanning**: HTTP-based subnet scanning (192.168.x.x, 10.0.x.x) is used to discover OpenClaw gateways on port 18789.

### Key Design Patterns

- **Local-first architecture**: All user data is stored locally via AsyncStorage.
- **Zero-dependency design**: Direct app-to-gateway connection without intermediary services.
- **Gateway connection model**: Supports various connection methods including local discovery, manual URL, Tailscale, and Cloudflare Tunnel.
- **Smart URL Scheme Detection**: Automatically selects `http/ws` for local IPs and `https/wss` for public domains.
- **Shared Types**: TypeScript interfaces for data models are defined in `lib/types.ts` and `lib/gateway.ts`.
- **Onboarding Flow**: Guides users through initial gateway connection.
- **Error Boundaries**: For graceful error handling.
- **Platform-aware Components**: Components adapt behavior for web vs. native.
- **Connection Status Banner**: Animated banner displays gateway connection status.
- **Toast Notification System**: Reusable provider for various notification types.
- **Swipe Actions**: For list items, with long-press fallback on web.
- **Data Export**: Full JSON backup of app data.
- **Performance Optimizations**: Heavy components are memoized to prevent unnecessary re-renders.

### Build & Deployment

- **Development**: Parallel `expo:dev` (Metro bundler) and `server:dev` (Express server) processes.
- **Production**: `expo:static:build` for web assets, `server:build` for bundled server, `server:prod` for production server execution.
- **Database Migrations**: `db:push` for schema changes via drizzle-kit.

### Directory Structure

- `app/`: Expo Router screens and layouts.
- `components/`: Reusable UI components.
- `constants/`: Theme colors and design tokens.
- `lib/`: Core logic and utilities.
- `server/`: Express backend.
- `shared/`: Shared frontend/backend code.
- `scripts/`: Build scripts.
- `assets/`: Media and fonts.

## External Dependencies

### Core Services

-   **PostgreSQL**: Configured via `DATABASE_URL` and used by Drizzle ORM, currently with minimal usage for a `users` table.
-   **OpenClaw Gateway**: The primary self-hosted AI gateway that the app connects to via WebSocket on port 18789.

### Key npm Packages

-   **expo** (~54.0.33): Core mobile framework.
-   **expo-dev-client** (~6.0.20): Development build client.
-   **expo-router** (~6.0.23): File-based navigation.
-   **express** (^5.0.1): Backend HTTP server.
-   **drizzle-orm** (^0.39.3) + **pg** (^8.16.3): Database ORM and PostgreSQL driver.
-   **@tanstack/react-query** (^5.83.0): Server state management.
-   **react-native-reanimated** (~4.1.1): Animations.
-   **react-native-gesture-handler** (~2.28.0): Touch gestures.
-   **expo-secure-store**: Secure credential storage.
-   **expo-local-authentication**: Biometric authentication.
-   **http-proxy-middleware**: Dev server proxy.

### Environment Variables

-   `DATABASE_URL`: PostgreSQL connection string.
-   `REPLIT_DEV_DOMAIN`: Replit development domain.
-   `REPLIT_INTERNAL_APP_DOMAIN`: Replit deployment domain.
-   `EXPO_PUBLIC_DOMAIN`: Public domain for API URL construction.