# ClawBase

## Overview
ClawBase is a React Native (Expo) mobile companion app designed for self-hosted OpenClaw AI gateways. It provides a secure, privacy-focused interface for managing AI agent interactions, including real-time chat, task management (Kanban), memory browsing, and gateway connection handling. The app connects directly to the user's OpenClaw Gateway via WebSocket and supports iOS, Android, and web platforms. It features an Express backend for API support and static serving, utilizes a "lobster" dark theme, and is built for deployment from Replit, with Expo cloud builds enabling native app store distribution. The project aims to empower users with full control over their AI interactions and data.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Mobile App)
- **Framework**: React Native with Expo SDK 54 and Expo Router v6 for file-based routing.
- **Navigation**: Tab-based layout (Home, Chat, Workspace, Calendar, Settings) with hidden granular routes. Tab bar uses static positioning (not absolute) with 84px height on web (includes 34px bottom inset). Content screens use `paddingBottom: insets.bottom + 20`.
- **State Management**: React Context for global state and React Query for server-state.
- **Local Storage**: AsyncStorage for persisting local data, `expo-secure-store` for sensitive data.
- **UI/UX**: "Lobster" dark theme, Inter font family, `expo-linear-gradient` for visual effects, `expo-haptics` for feedback, `react-native-reanimated` and `react-native-gesture-handler` for animations and gestures. Features include a connection status banner, toast notification system, swipe actions, and data export.
- **Security**: `expo-local-authentication` for biometric/PIN lock.

### Backend (Express Server + Relay)
- **Framework**: Express 5 (TypeScript) acting as a relay server, API proxy, and static file server.
- **Relay Server**: Manages WebSocket bridging between mobile clients and the OpenClaw gateway, handling JWT authentication, connection management with exponential backoff, message bridging, and streaming. It exposes REST API endpoints, implements rate limiting, and maintains an in-memory audit trail.
- **Storage**: Primarily uses in-memory storage, with Drizzle ORM configured for PostgreSQL for optional database usage, particularly for an audit log.

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect, schema defined using `drizzle-zod` for validation. Migrations via `drizzle-kit`. Primarily, app data resides in client-side AsyncStorage.

### Gateway Integration (Protocol v3)
- **Protocol**: Connects to self-hosted OpenClaw Gateways via WebSocket on port 18789 using Protocol v3 for secure, direct communication.
- **Authentication**: Supports gateway token and device token authentication.
- **RPC Methods**: Provides comprehensive control over AI agents, including `sessions.list`, `sessions.history`, `sessions.send`, `agent.cancel`, `config.get`, `system.health`, `automations.list`, `events.list`, and `ping`.
- **Features**: Real-time streaming, session browsing, memory synchronization, automatic re-connection, event system, and dashboard widgets.
- **Orchestration**: Commands gateway for tunnel management, pairing code generation, settings rebinding, and arbitrary command invocation.
- **Pairing System**: Supports QR code scanning, Tailscale/remote URL, gateway pairing code, and manual URL entry. Includes gateway reachability testing via WebSocket handshake and deep linking (`clawbase://`, `openclaw://`).
- **Network Discovery**: Scans local networks (192.168.x.x, 10.0.x.x) for OpenClaw gateways on port 18789.

### Key Design Patterns
- **Local-first architecture**: User data primarily stored locally in AsyncStorage.
- **Zero-dependency design**: Direct app-to-gateway connection without intermediary services.
- **Intelligent Connection Model**: Supports local discovery, manual URL, Tailscale, and Cloudflare Tunnel, with smart `http/ws` vs. `https/wss` URL scheme detection.
- **Shared Types**: TypeScript interfaces for data models in `lib/types.ts` and `lib/gateway.ts`.
- **Onboarding Flow**: Guides new users through initial gateway connection.
- **Cross-Entity Intelligence**:
    - **Entity Link Registry**: Bi-directional linking between `conversation`, `task`, `memory`, `calendar`, `contact` entities, stored locally. Supports relations like `created_from`, `mentions`, `related_to`, `spawned_by`.
    - **Proactive Insights Engine**: Analyzes local data and entity links to generate actionable alerts (e.g., overdue tasks, stale contacts, unreviewed memory). Insights are prioritized and displayed on the dashboard with inline actions.
    - **Link Suggestions Engine**: Suggests unlinked relationships based on shared keywords, tags, and mentions.
    - **Auto-Tagging**: Entities receive `from:<source>` tags upon creation (e.g., `from:chat`).
    - **Chat Mention Detection**: Scans chat messages to auto-create `mentions` entity links to CRM contacts, tasks, and calendar events.
    - **Knowledge Graph Widget/Explorer**: Visualizes and allows browsing of entity links, identifying "hub" entities.
    - **Search Relevance Scoring**: Weighted multi-field scoring with recency boost, tag matching, priority/status bonuses, and graph-aware ranking.
- **Persistent Audit Log**: Logs device actions to PostgreSQL via Drizzle ORM and keeps the last 1000 entries in-memory.

## External Dependencies

### Core Services
- **PostgreSQL**: Used for audit logging and minimal other data via Drizzle ORM.
- **OpenClaw Gateway**: The primary self-hosted AI gateway (via WebSocket on port 18789).

### Key npm Packages
- **expo**: Core mobile development framework.
- **expo-router**: File-based navigation for Expo.
- **express**: Backend HTTP server.
- **drizzle-orm** + **pg**: PostgreSQL ORM and driver.
- **@tanstack/react-query**: Server state management.
- **react-native-reanimated**: Animations library.
- **react-native-gesture-handler**: Touch gesture handling.
- **expo-secure-store**: Secure credential storage.
- **expo-local-authentication**: Biometric/PIN authentication.

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `REPLIT_DEV_DOMAIN`: Replit development domain.
- `REPLIT_INTERNAL_APP_DOMAIN`: Replit deployment domain.
- `EXPO_PUBLIC_DOMAIN`: Public domain for API URL construction.