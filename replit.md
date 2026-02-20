# ClawBase

## Overview

ClawBase is a React Native (Expo) mobile companion app for self-hosted OpenClaw AI gateways. It provides a secure, beautiful interface for managing AI agent interactions — including real-time chat, task/Kanban boards, memory browsing, and gateway connection management. The app connects directly to the user's own OpenClaw Gateway via WebSocket, keeping all data private. It targets iOS, Android, and web platforms, with an Express backend server for API support and static serving.

The app follows a "lobster" dark theme with navy/black backgrounds and orange/red accents. It's designed to be built and deployed from Replit, with Expo cloud builds for native app store distribution.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Mobile App)
- **Framework**: React Native with Expo SDK 54, using Expo Router v6 for file-based routing
- **Navigation**: Tab-based layout with 5 visible tabs: Mission Control, Chat, Automations, Timeline, Memory + Files. Tasks and Settings are hidden tabs accessible via navigation. Uses `expo-router` with typed routes enabled
- **State Management**: React Context (`AppContext`) provides global state for connections, conversations, tasks, and memory. React Query (`@tanstack/react-query`) handles server-state for API calls
- **Local Storage**: AsyncStorage (`@react-native-async-storage/async-storage`) persists all local data (connections, conversations, messages, tasks, memory entries) with a key-prefixed storage pattern (`@clawbase:*`)
- **UI Libraries**: expo-linear-gradient for gradients, expo-blur for glass effects, expo-haptics for tactile feedback, react-native-reanimated for animations, react-native-gesture-handler for gestures, react-native-keyboard-controller for keyboard handling
- **Fonts**: Inter font family (400, 500, 600, 700 weights) via `@expo-google-fonts/inter`
- **Security**: expo-local-authentication for biometric/PIN lock, expo-secure-store for sensitive data

### Backend (Express Server)
- **Framework**: Express 5 (TypeScript) running on the server side
- **Purpose**: Serves as API proxy and static file server. In development, proxies to Expo's Metro bundler. In production, serves pre-built static web assets
- **Routes**: Defined in `server/routes.ts`, prefixed with `/api`
- **Storage**: Currently uses in-memory storage (`MemStorage` class in `server/storage.ts`) with a simple user model. Drizzle ORM is configured for PostgreSQL but the DB connection is optional — the app primarily uses client-side AsyncStorage

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts` — currently minimal with just a `users` table (id, username, password). Uses `drizzle-zod` for validation schema generation
- **Migrations**: Output to `./migrations` directory via `drizzle-kit`
- **Note**: The database is not yet heavily used. Most app data lives in client-side AsyncStorage. The Postgres database will likely grow as server-side features are added

### Gateway Integration (lib/gateway.ts)
- **WebSocket Client**: `OpenClawGateway` class connects to user's self-hosted OpenClaw Gateway on port 18789
- **Protocol**: Handshake → device pairing → token auth → RPC calls (chat.send, sessions.list, sessions.history, config.get, tools.invoke)
- **Streaming**: Real-time message.chunk events render streaming text in chat with blinking cursor
- **Session Browser**: `app/sessions.tsx` lists active gateway sessions (WhatsApp, Telegram, Discord, etc.) with conversation history modal
- **Memory Sync**: Memory tab fetches MEMORY.md, SESSION-STATE.md, and daily logs from gateway via tools.invoke
- **Auto-reconnect**: Exponential backoff with max 30s delay, automatic reconnection on connection loss
- **Event System**: 6+ event types (status_change, gateway_info, sessions_list, memory_data, message_chunk, message_complete)
- **Dashboard Widget**: GatewayStatusWidget shows live connection status, channel chips, session/model counts
- **Gateway Orchestration**: App can tell the gateway to start/stop tunnels (`config.tunnel.start/stop/status`), generate pairing codes (`config.pair.generate`), rebind gateway (`config.set`), and invoke arbitrary commands (`tools.invoke` with `command` tool)
- **Automations RPC**: `automations.list`, `automations.approvals`, `automations.toggle`, `automations.approve`, `automations.deny`, `automations.outputs` for managing heartbeat/cron automations
- **Events RPC**: `events.list` for fetching unified timeline of agent actions, alerts, and errors
- **Zero Relay Architecture**: All communication is direct between app and gateway — no intermediary servers, no relay dependencies. The pairing code flow calls the gateway's own `/api/pair/<code>` endpoint
- **Node Registration**: App registers as a "node" with capabilities (chat, tasks, memory, calendar, crm, canvas, notifications) following the OpenClaw protocol
- **Node.invoke Handling**: Gateway can send commands to the app via node.invoke; the app responds with node.invoke.result
- **Pairing Approval**: When gateway returns pairing.required, app shows approval waiting screen with CLI commands (openclaw nodes pending/approve)

### Pairing System (app/pair.tsx)
- **Four connection methods**: QR code scanning (camera), Tailscale/remote URL, gateway pairing code (gateway URL + code), manual URL entry
- **Reachability test**: Before saving a connection, the app tests the gateway's `/healthz` endpoint with a 6-second timeout
- **Unreachable flow**: If gateway can't be reached, shows diagnostic tips and offers "Try again" or "Save anyway for later"
- **Deep links**: Supports `clawbase://` and `openclaw://` URL schemes for one-tap connection
- **Direct-to-gateway pairing**: Pairing code is looked up via `GET http://<gateway>/api/pair/<code>` — the gateway generates and validates its own codes
- **Auto-discovery**: On mobile (Expo Go), the app scans the local network (192.168.x.x, 10.0.x.x ranges) for gateways on port 18789 by probing /healthz endpoints
- **Discovered gateways**: Discovered gateways are shown at the top of the connection screen with one-tap connect

### Network Discovery (lib/discovery.ts)
- **Network scanning for OpenClaw gateways**: HTTP-based subnet scanning as a fallback since native mDNS/Bonjour is not available in Expo Go
- **Scanning strategy**: Scans common LAN subnets (192.168.x.x, 10.0.x.x ranges) in batches of 15 with 2-second timeout per probe
- **Gateway detection**: Gateways are detected by probing the /healthz endpoint on port 18789
- **Discovery response**: Returns DiscoveredGateway[] array with host, port, name, version, and url for each discovered gateway

### Key Design Patterns
- **Local-first architecture**: All user data (connections, chats, tasks, memory) is stored locally on device via AsyncStorage. No central server required for core functionality
- **Zero-dependency design**: The app connects directly to user's OpenClaw Gateway with no relay, proxy, or intermediary service. The Express backend only serves static files and a landing page
- **Gateway connection model**: Users connect to their own OpenClaw Gateway instances via WebSocket URLs (supports local discovery, manual URL, Tailscale, Cloudflare Tunnel)
- **Local-first discovery**: Native mDNS/Bonjour not available in Expo Go, so HTTP-based subnet scanning is used as a fallback. Gateways are detected by probing port 18789
- **Smart URL scheme detection**: Local/private IPs automatically use http/ws; public domains use https/wss
- **Shared types**: `lib/types.ts` defines TypeScript interfaces used across the app (GatewayConnection, ChatMessage, Conversation, Task, MemoryEntry)
- **Gateway types**: `lib/gateway.ts` exports GatewaySession, GatewaySessionMessage, GatewayMemoryFile interfaces
- **Onboarding flow**: First-launch experience guides users through connecting to a gateway, with option to skip
- **Error boundaries**: Class-based ErrorBoundary component wraps the app for graceful error handling
- **Platform-aware components**: Components like `KeyboardAwareScrollViewCompat` provide platform-specific implementations (web vs native)

### Build & Deployment
- **Development**: Two parallel processes — `expo:dev` for the Expo Metro bundler, `server:dev` for the Express server (via tsx)
- **Production build**: `expo:static:build` generates static web assets, `server:build` bundles server with esbuild, `server:prod` runs the production server
- **Database migrations**: `db:push` pushes schema changes via drizzle-kit

### Directory Structure
- `app/` — Expo Router file-based screens and layouts
- `app/(tabs)/` — Main tab screens (dashboard, chat, tasks, memory, settings)
- `app/chat/[id].tsx` — Individual chat conversation screen
- `components/` — Reusable UI components
- `constants/` — Theme colors and design tokens
- `lib/` — Core logic (AppContext, storage, types, query client)
- `server/` — Express backend (routes, storage, templates)
- `shared/` — Shared code between frontend and backend (DB schema)
- `scripts/` — Build scripts
- `assets/` — Images, icons, fonts

## External Dependencies

### Core Services
- **PostgreSQL**: Database (configured via `DATABASE_URL` environment variable, used by Drizzle ORM). Currently minimal usage — schema has only a users table
- **OpenClaw Gateway**: The primary external service the app connects to. User's self-hosted AI gateway running on port 18789 with WebSocket protocol

### Key npm Packages
- **expo** (~54.0.27): Core mobile framework
- **expo-router** (~6.0.17): File-based navigation
- **express** (^5.0.1): Backend HTTP server
- **drizzle-orm** (^0.39.3) + **pg** (^8.16.3): Database ORM and PostgreSQL driver
- **@tanstack/react-query** (^5.83.0): Server state management
- **react-native-reanimated** (~4.1.1): Animations
- **react-native-gesture-handler** (~2.28.0): Touch gestures
- **expo-secure-store**: Secure credential storage
- **expo-local-authentication**: Biometric authentication
- **http-proxy-middleware**: Dev server proxy to Metro bundler

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `REPLIT_DEV_DOMAIN`: Replit development domain (used for CORS and proxy configuration)
- `REPLIT_INTERNAL_APP_DOMAIN`: Replit deployment domain
- `EXPO_PUBLIC_DOMAIN`: Public domain for API URL construction