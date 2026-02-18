# Phase 2: Life Companion Server + Telegram Bot

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Life Companion from Obsidian-only plugin to server-based system with Telegram bot — enabling always-on AI companion with proactive notifications, while sharing core logic between both platforms.

**Architecture:** Server-first monorepo. Single Docker process (Express + Telegram bot + shared core). Obsidian plugin syncs vault via event-driven HTTP. Claude OAuth token on server for AI.

**Tech Stack:** TypeScript monorepo (npm workspaces), Express, node-telegram-bot-api, node-cron, SSE, Docker

---

## Section 1: Overall Architecture

```
┌─────────────────────────────────────────┐
│              Docker Container           │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │         Shared Core             │   │
│  │  prompts, types, tools,         │   │
│  │  ai-client, tool definitions    │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│  ┌──────────┴──────────┐               │
│  │                     │               │
│  │  REST API      Telegram Bot         │
│  │  (Express)     (node-telegram-      │
│  │                 bot-api)            │
│  │  - Sync API    - Chat handler       │
│  │  - Settings    - Scheduler          │
│  │    web UI      - Inline keyboards   │
│  └──────────┬──────────┘               │
│             │                           │
│  ┌──────────┴──────────┐               │
│  │   Server Vault      │               │
│  │   /data/vaults/     │               │
│  │   {user-id}/        │               │
│  └─────────────────────┘               │
└─────────────────────────────────────────┘
         ▲                    ▲
         │ HTTP + SSE         │ Telegram API
         │                    │
    Obsidian Plugin      Telegram App
    (sync client)        (user's phone)
```

**Key decisions:**
- Single Docker process — simple deployment, no service mesh
- Server vault = filesystem (`/data/vaults/{user-id}/`) — same .md files as Obsidian
- Claude OAuth token on server (from `claude` CLI login on Ubuntu)
- Multi-user via per-user vault folders, Telegram user ID for identification

---

## Section 2: Event-Driven Sync Protocol

### Obsidian → Server (push on change)

```typescript
// In Obsidian plugin — register vault events
this.registerEvent(this.app.vault.on('modify', (file) => {
  this.syncClient.pushFile(file.path);  // debounce 1s
}));
this.registerEvent(this.app.vault.on('create', (file) => {
  this.syncClient.pushFile(file.path);
}));
this.registerEvent(this.app.vault.on('delete', (file) => {
  this.syncClient.deleteRemote(file.path);
}));
```

### Server → Obsidian (SSE stream)

```typescript
// Server: SSE endpoint
app.get('/sync/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const listener = (event: FileChangeEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  vaultWatcher.on('change', listener);
  req.on('close', () => vaultWatcher.off('change', listener));
});
```

### Sync API Endpoints

```
GET  /sync/manifest         → { "path": mtime, ... }
GET  /sync/pull?paths=...   → [ { path, content, mtime } ]
POST /sync/push             → { path, content, baseHash }
                             → 200 OK | 409 Conflict
DELETE /sync/file?path=...  → 200 OK
GET  /sync/events           → SSE stream of file changes
```

### Startup Full Sync

When Obsidian opens or SSE reconnects:
1. `GET /sync/manifest` → server returns `{ path: mtime }` for all files
2. Obsidian compares with local mtimes
3. Pull files where server is newer, push files where local is newer
4. ~500 files, manifest ~25KB, completes in <2s

### Conflict Resolution

- **Compare-and-swap**: Push includes `baseHash` (MD5 of content before edit). Server returns 409 if hash mismatch.
- **Policy**: Server-wins for the rare offline conflict case
- **Notification**: User gets notified of conflict via Telegram/Obsidian — "File X was modified on both sides, server version kept"
- **No .conflict files** — vault stays clean, always single source of truth

---

## Section 3: Shared Core / Monorepo Structure

```
life-companion/
├── packages/
│   ├── core/              ← Shared logic (no platform deps)
│   │   ├── src/
│   │   │   ├── prompts.ts         ← buildSystemPrompt(), BASE_PROMPT
│   │   │   ├── types.ts           ← ChatMode, ConversationState, ToolDef
│   │   │   ├── tools.ts           ← Tool definitions, selectTools()
│   │   │   ├── ai-client.ts       ← AIClient (Claude/OpenAI/Gemini/Groq)
│   │   │   ├── vault-interface.ts ← VaultOperations interface
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── server/            ← Docker deployment
│   │   ├── src/
│   │   │   ├── app.ts             ← Express + startup
│   │   │   ├── vault.ts           ← VaultOperations impl (Node fs)
│   │   │   ├── sync.ts            ← Sync API routes + SSE
│   │   │   ├── telegram.ts        ← Bot handler + inline keyboards
│   │   │   ├── scheduler.ts       ← node-cron jobs (briefing, reminders)
│   │   │   ├── settings-ui.ts     ← Web settings page (HTML)
│   │   │   └── auth.ts            ← Token management
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── tsconfig.json
│   │
│   └── obsidian/          ← Current plugin (refactored)
│       ├── src/
│       │   ├── main.ts            ← Plugin entry
│       │   ├── ChatView.ts        ← UI (Obsidian-specific)
│       │   ├── vault-tools.ts     ← VaultOperations impl (Obsidian API)
│       │   ├── sync-client.ts     ← NEW: Sync client (HTTP + SSE)
│       │   ├── settings.ts        ← Settings UI
│       │   └── calendar.ts        ← Calendar integration
│       ├── manifest.json
│       ├── styles.css
│       └── package.json
│
├── docker-compose.yml
├── package.json           ← workspaces: ["packages/*"]
└── tsconfig.base.json
```

### VaultOperations Interface (core)

```typescript
export interface VaultOperations {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listFiles(folder?: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
  getFileMtime(path: string): Promise<number>;
  exists(path: string): Promise<boolean>;
}
```

- Obsidian implements via `this.app.vault.*`
- Server implements via Node `fs` (reading/writing to `/data/vaults/{userId}/`)
- Core tools reference `VaultOperations` — platform-agnostic

---

## Section 4: Telegram Bot

### Chat Flow

Every text message → shared core `handleMessage()` → AI response → reply.
Same tools, same prompts, same behavior as Obsidian chat.

### Commands & Inline Keyboards

**Model selection** — user types "model" → inline keyboard buttons:
```
Bot: Chon model:
┌─────────────────────────┐
│ Claude Sonnet 4  ✓      │  ← currently active
├─────────────────────────┤
│ Claude Opus 4           │
├─────────────────────────┤
│ GPT-4o                  │
└─────────────────────────┘
```

Only shows models that user has enabled in settings. Uses Telegram `callback_query` for selection.

**Other commands:**
- `/start` — link Telegram user ID with vault
- `/mode quick|dive` — switch chat mode
- `/search <query>` — search vault
- `/today` — daily briefing
- `/settings` — link to web settings UI

### Telegram-specific features

- Markdown formatting (Telegram subset)
- Long responses → split into multiple messages (4096 char limit)
- Inline keyboard for confirmations ("Save this note?", "Create event?")
- File attachments → save to vault

### Proactive Notifications (push-first)

This is the key differentiator from Obsidian — Telegram can proactively push messages.

| Type | Trigger | Example |
|------|---------|---------|
| Morning briefing | Cron (configurable, default 7:00 AM) | "Chao anh, hom nay co 2 events, 1 task deadline..." |
| **AI-driven event reminders** | Scheduler scans → AI decides timing | See below |
| Goal check-in | Weekly cron | "Tuan nay tien do gym: 2/4 buoi. Cap nhat?" |
| Task deadline | Daily cron check | "Task X deadline ngay mai, chua done" |
| Evening recap | Cron (configurable, default 9:00 PM) | "Hom nay anh da tao 3 notes, hoan thanh 2 tasks" |

### AI-Driven Smart Reminders

Instead of fixed "15 min before" for every event, the AI analyzes each event and generates a **reminder plan** — multiple reminders at appropriate times based on context.

**How it works:**

1. **When event is created/synced**, scheduler calls AI with event details:

```typescript
// server/scheduler.ts
async function planReminders(event: CalendarEvent): Promise<ReminderPlan[]> {
  const prompt = `You are a reminder planner. Given this event, decide WHEN and HOW to remind the user.
Consider: event importance, preparation needed, travel time, time of day.

Event: ${event.title}
Date: ${event.date} ${event.time}
Location: ${event.location || "none"}
Description: ${event.description || "none"}

Return JSON array of reminders:
[{ "beforeMinutes": number, "message": "string", "priority": "high"|"normal" }]

Examples:
- Doctor appointment 2pm → [{ beforeMinutes: 1440, message: "Ngay mai co lich kham bac si luc 2pm", priority: "high" }, { beforeMinutes: 60, message: "Lich kham bac si trong 1 tieng nua", priority: "high" }]
- Coffee with friend 3pm → [{ beforeMinutes: 30, message: "Gap ban luc 3pm — 30 phut nua", priority: "normal" }]
- Flight 6am → [{ beforeMinutes: 43200, message: "Ngay kia co chuyen bay 6am, chuan bi hanh ly", priority: "high" }, { beforeMinutes: 720, message: "Chuyen bay sang som 6am — nen ngu som", priority: "high" }, { beforeMinutes: 180, message: "Chuyen bay trong 3 tieng", priority: "high" }]
- Team standup daily 9am → [{ beforeMinutes: 10, message: "Standup trong 10 phut", priority: "normal" }]
- Project deadline Friday → [{ beforeMinutes: 4320, message: "Deadline project X con 3 ngay", priority: "high" }, { beforeMinutes: 1440, message: "Deadline ngay mai!", priority: "high" }]`;

  const response = await aiClient.sendSimple(prompt);
  return JSON.parse(response);
}
```

2. **Reminder plans stored** in `system/reminders.json`:

```typescript
interface ReminderEntry {
  eventId: string;
  eventTitle: string;
  reminders: {
    sendAt: number;    // Unix timestamp
    message: string;
    priority: "high" | "normal";
    sent: boolean;
  }[];
}
```

3. **Scheduler checks every minute**, sends due reminders:

```typescript
// Runs every minute
cron.schedule("* * * * *", async () => {
  const now = Date.now();
  const entries = await loadReminders();

  for (const entry of entries) {
    for (const r of entry.reminders) {
      if (!r.sent && r.sendAt <= now) {
        await telegram.sendMessage(chatId, r.message);
        r.sent = true;
      }
    }
  }

  await saveReminders(entries);
});

// Morning briefing
cron.schedule("0 7 * * *", async () => {
  const briefing = await core.generateBriefing(userId);
  await telegram.sendMessage(chatId, briefing);
});
```

4. **Re-plan on event update**: If user modifies event time/details → old reminders cleared, AI generates new plan.

**Result — AI decides intelligently:**

| Event | AI-generated reminders |
|-------|----------------------|
| Doctor 2pm | 1 day before + 1 hour before |
| Coffee 3pm | 30 min before |
| Flight 6am | 2 days before + night before + 3 hours before |
| Daily standup 9am | 10 min before |
| Project deadline Fri | 3 days before + 1 day before |
| Birthday party Sat 7pm | 1 week before ("mua qua") + morning of + 2 hours before |

The AI call is cheap (1 small prompt per event creation, not per reminder check) and only happens when events are created/updated.

### Web Settings UI

Server exposes `/settings/:token` — each user gets a unique settings URL.

```
User: /settings
Bot: "Mở settings: https://your-server.com/settings/abc123"
```

Settings page (server-rendered HTML + vanilla JS):

| Section | Settings |
|---------|----------|
| **AI Models** | Toggle on/off per model, choose default model |
| **Notifications** | Morning/evening briefing time, reminder lead time, mute hours |
| **Sync** | View sync status, force full sync |
| **Profile** | View/edit profile (rendered from profile.md) |

Tech: Express route `GET /settings/:token` returns HTML, `POST /settings/:token` saves changes. Token generated on `/start` or `/settings` command.

---

## Section 5: Docker Deployment

```yaml
# docker-compose.yml
version: "3.8"
services:
  life-companion:
    build: .
    restart: unless-stopped
    ports:
      - "3456:3456"
    volumes:
      - ./data:/data          # Vault files persist here
      - ./config:/config      # Settings, tokens
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - CLAUDE_ACCESS_TOKEN=${CLAUDE_ACCESS_TOKEN}
      - PORT=3456
```

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/core/package*.json packages/core/
COPY packages/server/package*.json packages/server/
RUN npm ci --workspace=packages/core --workspace=packages/server
COPY packages/core packages/core
COPY packages/server packages/server
RUN npm run build --workspace=packages/core --workspace=packages/server
EXPOSE 3456
CMD ["node", "packages/server/dist/app.js"]
```

---

## Section 6: Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| Claude OAuth token expiry | HIGH | Health check endpoint, token refresh logic, Telegram notification when token dies |
| Refactoring effort (extract shared core) | MEDIUM | Keep current plugin working 100% during refactor, extract incrementally |
| SSE connection drops | LOW | Auto-reconnect + startup full sync covers gaps |
| Server = single point of failure | LOW | Docker restart policy, Obsidian works offline independently |
| Sync race conditions | VERY LOW | Compare-and-swap + server-wins, practically impossible with single user |

No showstoppers. Biggest risk is OAuth token — but only requires re-login, no data loss.

---

## Implementation Phases

### Phase 2a: Monorepo + Shared Core (extract from current plugin)
1. Set up monorepo structure with npm workspaces
2. Extract `prompts.ts`, `types.ts`, tool definitions → `packages/core/`
3. Define `VaultOperations` interface
4. Extract `ai-client.ts` → `packages/core/` (remove Obsidian deps)
5. Refactor `packages/obsidian/` to import from `@life-companion/core`
6. Verify current plugin still works identically

### Phase 2b: Server + Sync
1. Implement `ServerVaultOperations` (Node fs)
2. Build sync API (manifest, push, pull, delete)
3. Build SSE endpoint for server → client events
4. Build `SyncClient` in Obsidian plugin
5. Wire up vault events → sync client
6. Test full sync cycle: Obsidian edit → server → verify

### Phase 2c: Telegram Bot
1. Set up Telegram bot with BotFather
2. Build bot handler using shared core `handleMessage()`
3. Implement commands (/start, /mode, /search, /today)
4. Implement inline keyboards (model selection, confirmations)
5. Build scheduler (cron jobs for briefing, reminders)
6. Build web settings UI

### Phase 2d: Docker + Deploy
1. Write Dockerfile + docker-compose.yml
2. Deploy to Ubuntu server
3. Configure domain/reverse proxy
4. Test end-to-end: Obsidian ↔ Server ↔ Telegram