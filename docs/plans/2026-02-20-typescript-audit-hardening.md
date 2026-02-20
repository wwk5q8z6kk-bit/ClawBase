# TypeScript Audit Hardening Implementation Plan

> **REQUIRED SUB-SKILL:** Use plan-implementation to implement this plan task-by-task.

**Goal:** Eliminate current TypeScript compile failures so the app/server compile cleanly under strict checks.

**Architecture:** Keep behavior stable and resolve compile errors by correcting impossible status branches, aligning UI style keys with actual component usage, and updating APIs to current library contracts. Apply minimal changes per file and verify with a single shared quality gate (`npx tsc --noEmit`).

**Tech Stack:** Expo Router, React Native, TypeScript, Express, ws

---

### Task 1: Capture Failing Gate

**Files:**
- Verify: `npx tsc --noEmit`

**Step 1: Run failing typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL with errors in `index.tsx`, `settings.tsx`, `vault.tsx`, `chat/[id].tsx`, and server files.

### Task 2: Fix Status-Type Drift

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/chat/[id].tsx`

**Step 1: Remove unreachable status comparison in gateway widget copy**

Update message branch in `index.tsx` so post-guard status text only handles reachable states.

**Step 2: Remove unsupported message status branch**

Update message footer in `chat/[id].tsx` to stop checking `'pending'` when message status union does not include it.

**Step 3: Re-run typecheck**

Run: `npx tsc --noEmit`
Expected: previous two errors removed.

### Task 3: Update File Export API Usage

**Files:**
- Modify: `app/(tabs)/settings.tsx`

**Step 1: Replace legacy `documentDirectory` + `writeAsStringAsync` usage**

Use `expo-file-system` current API (`Paths.document` and `File`) to write export JSON, then share by `file.uri`.

**Step 2: Re-run typecheck**

Run: `npx tsc --noEmit`
Expected: FileSystem type errors removed.

### Task 4: Restore Missing Vault Style Keys

**Files:**
- Modify: `app/(tabs)/vault.tsx`

**Step 1: Add missing keys referenced by `styles.*`**

Add style keys used by task detail, task create, and memory card sections (`container`, `input`, `tagText`, `sourceText`, `sourceBadge`, `typeBadge`, `typeBadgeText`, `reviewBadge`, `relevanceRow`, `relevanceBarBg`, `relevanceBarFill`, `relevanceValue`, `deleteBtn`, `deleteBtnText`).

**Step 2: Keep visual parity by mirroring nearby existing style values**

Reuse existing style tokens and spacing from neighboring definitions so UI remains consistent.

**Step 3: Re-run typecheck**

Run: `npx tsc --noEmit`
Expected: all `vault.tsx` style property errors removed.

### Task 5: Fix Server Strict Typing

**Files:**
- Modify: `server/index.ts`
- Modify: `server/relay.ts`

**Step 1: Type callback argument for domain split**

Annotate split callback arg in `server/index.ts`.

**Step 2: Use correct WebSocket server class + callback typing**

In `relay.ts`, instantiate `WebSocketServer` directly and type upgrade callback websocket param.

**Step 3: Re-run typecheck**

Run: `npx tsc --noEmit`
Expected: server typing errors removed.

### Task 6: Final Verification

**Files:**
- Verify: `npx tsc --noEmit`
- Verify: `npm run lint` (best-effort)

**Step 1: Run full typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (exit 0).

**Step 2: Run lint for additional audit signal**

Run: `npm run lint`
Expected: no blocking lint errors or capture remaining issues explicitly.
