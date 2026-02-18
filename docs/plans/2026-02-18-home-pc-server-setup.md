# Home PC Server Setup + Vault Sync Plan

**Goal:** Chạy Life Companition AI server trên PC ở nhà (luôn bật), sync vault với MacBook qua Syncthing. Telegram bot hoạt động 24/7.

**Status:** Plan only — chưa implement. Single-user MVP.

---

## Architecture

```
MacBook (di động)                    PC ở nhà (luôn bật)
┌──────────────────┐                ┌──────────────────────────┐
│ Obsidian + Plugin │                │ Server (Node.js)          │
│                  │                │ ├── Telegram bot           │
│ Vault folder ◄──────Syncthing──────► Vault folder (copy)     │
│ ~/Documents/     │   2-way sync   │ ├── Scheduler (cron)      │
│   My Vault/      │                │ └── Express (health)      │
└──────────────────┘                └──────────────────────────┘
         │                                     │
         └──── cùng vault data ────────────────┘
```

## Step 1: Setup Syncthing

### On MacBook
1. Install: `brew install syncthing`
2. Start: `brew services start syncthing`
3. Open UI: `http://localhost:8384`
4. Add vault folder to share (e.g. `~/Documents/My Vault`)

### On Home PC
1. Install Syncthing (Windows: installer, Linux: apt/pacman)
2. Open UI: `http://localhost:8384`
3. Add MacBook as remote device (scan QR or enter device ID)
4. Accept shared folder → choose local path (e.g. `D:\Vault` or `/home/dat/vault`)

### Syncthing Config
- **Sync type:** Send & Receive (2-way)
- **Ignore patterns:** Add `.obsidian/workspace.json` (changes too often, per-device)
- **File versioning:** Simple (keep 3 versions) — safety net for conflicts
- **Rescan interval:** 10 seconds (near-realtime)

### .stignore file (in vault root)
```
// Obsidian workspace state (per-device, don't sync)
.obsidian/workspace.json
.obsidian/workspace-mobile.json

// Plugin cache (per-device)
.obsidian/plugins/*/data.json

// OS files
.DS_Store
Thumbs.db
```

---

## Step 2: Setup Server on Home PC

### Prerequisites
- Node.js >= 20
- Git
- Syncthing running + vault synced

### Install
```bash
git clone https://github.com/tranvuongquocdat/life-companition-AI.git
cd life-companition-AI

# Build server (cài server deps + build)
npm run build:server
```

### Configure .env
```bash
cp .env.example .env
```

Edit `.env`:
```
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_CHAT_ID=<your chat ID>
VAULT_PATH=D:\Vault          # Windows
# VAULT_PATH=/home/dat/vault  # Linux

CLAUDE_API_KEY=<your key>
# hoặc các provider khác

DEFAULT_MODEL=claude-sonnet-4-5
MORNING_HOUR=7
EVENING_HOUR=21
TZ=Asia/Ho_Chi_Minh
LANGUAGE=vi
```

### Get Telegram Chat ID
1. Message @BotFather → `/newbot` → get bot token
2. Message your new bot
3. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Find `"chat":{"id":123456789}` → that's your chat ID

### Run
```bash
npm run start:server
```

### Auto-start on boot

**Windows (Task Scheduler):**
1. Open Task Scheduler → Create Basic Task
2. Trigger: "When the computer starts"
3. Action: Start a program
   - Program: `node`
   - Arguments: `packages/server/dist/index.js`
   - Start in: `C:\path\to\life-companition-AI`

**Linux (systemd):**
```ini
# /etc/systemd/system/life-companition.service
[Unit]
Description=Life Companition AI Server
After=network.target

[Service]
Type=simple
User=dat
WorkingDirectory=/home/dat/life-companition-AI
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=always
RestartSec=10
EnvironmentFile=/home/dat/life-companition-AI/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable life-companition
sudo systemctl start life-companition
```

---

## Step 3: Verify

1. **Syncthing:** Edit note on MacBook → check it appears on PC within ~10s
2. **Telegram:** Send message to bot → get AI response
3. **Vault access:** Bot can read notes, save memories, check calendar
4. **Briefing:** Wait for morning hour → receive briefing on Telegram
5. **2-way sync:** Bot saves memory → check it appears in Obsidian on MacBook

---

## Known Limitations (MVP)

### Race conditions
Nếu cả plugin (MacBook) và server (PC) cùng ghi 1 file cùng lúc → Syncthing tạo conflict file. Xác suất thấp vì:
- Plugin ghi khi user đang chat trong Obsidian
- Server ghi khi user chat qua Telegram
- User thường chỉ dùng 1 cái tại 1 thời điểm

**Mitigation:** Syncthing conflict files có tên `filename.sync-conflict-*`. Kiểm tra định kỳ.

### Sync delay
- Syncthing: ~10-30 giây delay
- Nếu chat qua Telegram → ghi memory → mở Obsidian ngay → có thể chưa thấy
- Chờ vài giây là có

### Obsidian metadata cache
- Server đọc raw markdown, không có Obsidian's metadata cache
- Search chậm hơn plugin (scan toàn bộ files thay vì dùng index)
- Với vault <1000 files thì không đáng kể

---

## Future: Multi-user (Phase 3+)

Khi muốn support nhiều user:
1. User store (JSON/SQLite): `chatId → {name, vaultPath, apiKeys, prefs}`
2. Per-user VaultTools + CalendarManager instances
3. Per-user conversation state: `Map<chatId, ConversationState>`
4. Per-user scheduler (mỗi user có giờ briefing riêng)
5. Registration flow qua Telegram: `/register` → set vault path → set API key
6. Admin commands: `/users`, `/approve <chatId>`

---

## Future: Vault Sync Protocol (Phase 3+)

Thay vì Syncthing (file-level sync), build HTTP sync protocol:
- Plugin pushes changes to server via REST API
- Server pushes changes to plugin via SSE (Server-Sent Events)
- Conflict resolution: last-write-wins with merge for append-only files (memories, daily notes)
- Eliminates need for Syncthing
- Enables cloud deployment (VPS) without file sync tool
