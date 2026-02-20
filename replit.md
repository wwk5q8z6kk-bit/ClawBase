# ClawCockpit

## Overview

ClawCockpit is a React Native (Expo) mobile companion app for self-hosted OpenClaw AI gateways. It provides a secure, beautiful "cockpit" interface for managing AI agent interactions — including real-time chat, task/Kanban boards, memory browsing, and gateway connection management. The app connects directly to the user's own OpenClaw Gateway via WebSocket, keeping all data private. It targets iOS, Android, and web platforms, with an Express backend server for API support and static serving.

The app follows a "lobster" dark theme with navy/black backgrounds and orange/red accents. It's designed to be built and deployed from Replit, with Expo cloud builds for native app store distribution.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Mobile App)
- **Framework**: React Native with Expo SDK 54, using Expo Router v6 for file-based routing
- **Navigation**: Tab-based layout with 5 main tabs: Dashboard, Chat, Tasks, Memory, Settings. Uses `expo-router` with typed routes enabled
- **State Management**: React Context (`AppContext`) provides global state for connections, conversations, tasks, and memory. React Query (`@tanstack/react-query`) handles server-state for API calls
- **Local Storage**: AsyncStorage (`@react-native-async-storage/async-storage`) persists all local data (connections, conversations, messages, tasks, memory entries) with a key-prefixed storage pattern (`@clawcockpit:*`)
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

### Key Design Patterns
- **Local-first architecture**: All user data (connections, chats, tasks, memory) is stored locally on device via AsyncStorage. No central server required for core functionality
- **Gateway connection model**: Users connect to their own OpenClaw Gateway instances via WebSocket URLs (supports local discovery, manual URL, Tailscale, Cloudflare Tunnel)
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