# ClawBase

## Overview
ClawBase is a React Native (Expo) mobile companion app designed for self-hosted OpenClaw AI gateways. It provides a secure, privacy-focused interface for managing AI agent interactions, including real-time chat, task management (Kanban), memory browsing, and gateway connection handling. The app connects directly to the user's OpenClaw Gateway via WebSocket and supports iOS, Android, and web platforms. It features an Express backend for API support and static serving, utilizes a "lobster" dark theme, and is built for deployment from Replit, with Expo cloud builds enabling native app store distribution. The project aims to empower users with full control over their AI interactions and data.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Mobile App)
- **Framework**: React Native with Expo SDK 54 and Expo Router v6 for file-based routing.
- **Navigation**: Tab-based layout (Home, Chat, Workspace, Automate, Settings) with hidden granular routes (Calendar, Tasks, Memory, Timeline accessible via navigation). Tab bar uses static positioning (not absolute) with 84px height on web (includes 34px bottom inset). Content screens use `paddingBottom: insets.bottom + 20`.
- **Layout Pattern**: Scrollable content (FlatList/ScrollView) must be wrapped in `<View style={{ flex: 1 }}>`, never in React Fragments (`<>...</>`). Fragments don't propagate flex height, which prevents scrolling. Filter chips must use fixed `height: 32` with `justifyContent/alignItems: center`, wrapped in a `<View style={{ height: 52, flexShrink: 0 }}>` with horizontal `<ScrollView>`. Web top insets: `webTopPad = Platform.OS === 'web' ? 47 : 0` + `paddingTop: insets.top + webTopPad`. Bottom padding for scroll containers: `paddingBottom: insets.bottom + 20` (not hardcoded 100).
- **State Management**: React Context for global state and React Query for server-state.
- **Local Storage**: AsyncStorage for persisting local data, `expo-secure-store` for sensitive data.
- **UI/UX**: "Lobster" dark theme, Inter font family, `expo-linear-gradient` for visual effects, `expo-haptics` for feedback, `react-native-reanimated` and `react-native-gesture-handler` for animations and gestures. Features include a connection status banner, toast notification system, swipe actions, and data export.
- **Security**: `expo-local-authentication` for biometric/PIN lock.

### Backend (Express Server + Relay)
- **Framework**: Express 5 (TypeScript) acting as a relay server, API proxy, and static file server.
- **Relay Server**: Manages WebSocket bridging between mobile clients and the OpenClaw gateway, handling JWT authentication, connection management with exponential backoff, message bridging, and streaming. It exposes REST API endpoints, implements rate limiting, and maintains an in-memory audit trail.
- **Storage**: Primarily uses in-memory storage, with Drizzle ORM configured for PostgreSQL for optional database usage, particularly for an audit log.
- **Port Stability**: Server uses retry loop with `server.once("error")` (up to 3 attempts) to handle EADDRINUSE port conflicts gracefully. Port-kill function reads `/proc/net/tcp` to find socket inodes and matches them to PIDs via `/proc/*/fd` — works in NixOS without `lsof` or `fuser`.

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
    - **Entity Link Registry**: Bi-directional linking between `conversation`, `task`, `memory`, `calendar`, `contact`, `mindmap` entities, stored locally. Supports relations like `created_from`, `mentions`, `related_to`, `spawned_by`.
    - **Proactive Insights Engine**: Analyzes local data and entity links to generate actionable alerts (e.g., overdue tasks, stale contacts, unreviewed memory). Insights are prioritized and displayed on the dashboard with inline actions.
    - **Link Suggestions Engine**: Suggests unlinked relationships based on shared keywords, tags, and mentions.
    - **Auto-Tagging**: Entities receive `from:<source>` tags upon creation (e.g., `from:chat`).
    - **Chat Mention Detection**: Scans chat messages to auto-create `mentions` entity links to CRM contacts, tasks, and calendar events.
    - **Knowledge Graph Widget/Explorer**: Visualizes and allows browsing of entity links, identifying "hub" entities.
    - **Search Relevance Scoring**: Weighted multi-field scoring with recency boost, tag matching, priority/status bonuses, and graph-aware ranking.
- **Persistent Audit Log**: Logs device actions to PostgreSQL via Drizzle ORM and keeps the last 1000 entries in-memory.

### Chat Entity Creation System
- **+ Button Menu**: Opens a modal sheet with options to create task, memory, event, or contact directly from chat.
- **Slash Commands**: Typing `/task`, `/memory`, `/event`, `/contact` in chat input shows suggestion chips that open entity creation sheets.
- **Entity Creation Sheet**: Modal with title/description inputs, type-specific icons and colors, creates entity and auto-links to conversation.
- **Inline Action Chips**: After AI messages, shows "Save as memory", "Create task", "Add to calendar" chips.
- **Message Long-Press**: Extended action sheet includes "Save as Memory" and "Create Task" options.
- **Context Panel**: Shows linked entities at top of chat with status details.

### Workflow Automation System
- **Data Model** (`lib/automationRecipes.ts`): Recipes with trigger + action chains, stored in AsyncStorage.
- **Trigger Types**: `schedule` (interval/daily/weekday), `keyword` (message content matching), `entity_created` (fires when task/memory/event created).
- **Action Types**: `send_chat`, `create_task`, `create_memory`, `notify`, `gateway_command`.
- **Trigger Engine**: Runs in AppContext — schedule triggers checked every 60s, keyword triggers hooked into chat send/receive, entity_created triggers hooked into create functions.
- **Recipe Builder UI**: Multi-step modal (pick trigger → configure → pick actions → name & save) on automations tab.
- **Recipe Management**: My Recipes section with toggle, delete, run count display.

### Canvas Mind Map System
- **Data Model** (`lib/mindmap.ts`): Mind maps with nodes (id, text, x, y, width, height, color, type) and edges (from, to), stored in AsyncStorage.
- **Node Types**: `idea`, `task`, `memory`, `event`, `contact` — matching entity types with color-coded visuals.
- **Canvas** (`app/mindmap.tsx`): PanResponder-based canvas with pan/zoom, node dragging, SVG edge rendering.
- **Node Editing**: Double-tap to edit (text, type, color), double-tap empty space to create node.
- **Edge Creation**: Long-press node to enter connection mode, tap another to create edge.
- **Floating Toolbar**: Add Node, AI Ideas, Undo, Delete Selected.
- **AI Idea Generation**: Sends node texts to gateway AI, parses response, creates radial-layout nodes with auto-edges. Falls back to simulated ideas when offline.
- **Entity Promotion**: Nodes can be promoted to real tasks/memories/events with entity links.
- **Navigation**: Accessible from Workspace Knowledge tab (Mind Maps section) and dashboard command bar.

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
- **react-native-svg**: SVG rendering for mind map edges.
- **expo-secure-store**: Secure credential storage.
- **expo-local-authentication**: Biometric/PIN authentication.
- **expo-crypto**: UUID generation for entity IDs.

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `REPLIT_DEV_DOMAIN`: Replit development domain.
- `REPLIT_INTERNAL_APP_DOMAIN`: Replit deployment domain.
- `EXPO_PUBLIC_DOMAIN`: Public domain for API URL construction.
