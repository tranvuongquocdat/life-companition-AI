# Dự án cuộc đời — Life Companion

> AI-powered Obsidian plugin: "người bạn đồng hành" hiểu bạn, cùng suy nghĩ, ghi chép lại cuộc đời có hệ thống.

## 1. Tổng quan

**Bản chất:** Obsidian plugin hoạt động như một người bạn AI — hiểu bạn qua thời gian, cùng brainstorm, challenge ý tưởng, ghi chép có hệ thống, nhắc nhở thông minh, và định kỳ cùng bạn nhìn lại cuộc đời.

**Thành phần chính:**

- **Obsidian Plugin** — chat panel bên phải (như Copilot trong VS Code)
- **Claude API** — bộ não xử lý, với tool use (agentic approach)
- **Profile System** — file cá nhân hoá AI luôn đọc trước mỗi session
- **Dynamic Vault Structure** — cấu trúc linh hoạt, lớn lên cùng bạn

**Hai chế độ chat:**

- **Quick capture** (mặc định) — nhắn nhanh, AI phân loại & lưu
- **Deep dive** (bật bằng `/dive`) — AI cùng brainstorm, research, challenge rồi mới ghi note chất lượng cao

**Hai hướng tương tác:**

- **Bạn → AI:** note, brainstorm, hỏi
- **AI → Bạn:** review, nhắc nhở, tổng hợp từ vault (chỉ khi được phép)

**Nguyên tắc vàng:** AI đề xuất, bạn duyệt. AI không tự ý làm gì.

---

## 2. Onboarding

**Lần đầu mở plugin:**

1. **Auth:** OAuth device flow — hiện link Anthropic → auth trên browser → paste code vào plugin
2. **Chọn model mặc định:**
   - Claude Haiku 4.5 — nhanh, rẻ, cho quick capture
   - Claude Sonnet 4.5 — cân bằng, đủ cho hầu hết
   - Claude Opus 4.6 — sâu nhất, cho deep dive & retro
3. **Auto-select theo chế độ:**
   - Quick capture → Haiku
   - Deep dive → Sonnet hoặc Opus
   - Retro → Opus
4. Override bất kỳ lúc nào: `/model opus`

---

## 3. Cấu trúc Vault

Cấu trúc ban đầu (điểm khởi đầu, không hardcode):

```
📁 Obsidian Vault/
├── _life/
│   ├── profile.md       ← AI đọc đầu tiên: bạn là ai, mục tiêu, ưu tiên
│   ├── index.md         ← "bản đồ" vault: schema + chỉ dẫn AI xem gì ở đâu
│   ├── reminders.md     ← danh sách nhắc nhở có cấu trúc
│   └── retro/           ← weekly / monthly / quarterly retro notes
│
├── ideas/               ← ý tưởng chưa thực hiện
│   ├── side-projects/
│   ├── freelance/
│   └── company/
│
├── projects/            ← đang thực hiện / đã thực hiện
│   ├── side-projects/
│   ├── freelance/
│   └── company/
│
├── career/
│   ├── skills/
│   ├── goals/
│   └── opportunities/
│
├── relationships/
│   ├── family/
│   ├── friends/
│   ├── partners/        ← đối tác công việc
│   └── agencies/
│
├── personal/
│   ├── health/
│   ├── finance/
│   └── habits/
│
├── books/
│   ├── reading/
│   ├── finished/
│   └── to-read.md
│
├── _chats/              ← lịch sử chat AI
└── _inbox/              ← quick capture, AI phân loại sau
```

**Nguyên tắc:**

- `_life/index.md` là "schema" — bạn hoặc AI có thể cập nhật khi vault phát triển
- AI đề xuất thay đổi cấu trúc, bạn duyệt
- Mọi note dùng `[[wiki links]]` để liên kết chéo
- `_inbox/` cho note nhanh chưa phân loại
- Idea confirm thực hiện → AI chuyển từ `ideas/` sang `projects/`

---

## 4. Kiến trúc kỹ thuật

### Tech stack

```
Obsidian Plugin (TypeScript)
├── UI Layer
│   ├── Chat Panel (side panel)
│   └── Settings Page
│
├── Core
│   ├── Auth Module          ← OAuth device flow với Anthropic
│   ├── Chat Manager         ← conversation, chế độ quick/dive
│   ├── Note Manager         ← đọc/ghi/di chuyển note
│   └── Link Engine          ← phát hiện & tạo [[wiki links]]
│
└── Claude API
    ├── Model Router         ← Haiku/Sonnet/Opus tuỳ chế độ
    ├── Tool Definitions     ← tools cho Claude sử dụng
    └── Streaming Response   ← hiển thị real-time
```

### Tool use (Agentic approach)

Không dùng embedding hay keyword search phức tạp. Cung cấp tools cho Claude, model tự quyết định khi nào cần dùng:

```
Tools:
├── search_vault(query)          ← tìm note theo keyword
├── read_note(path)              ← đọc nội dung note
├── write_note(path, content)    ← tạo/sửa note
├── move_note(from, to)          ← di chuyển note
├── list_folder(path)            ← xem cấu trúc folder
├── get_recent_notes(days)       ← note gần đây
├── create_reminder(content, due_date, context_note, priority)
├── list_reminders()
└── complete_reminder(id)
```

### Mỗi request gửi Claude API

```
System prompt:
  - profile.md (bạn là ai)
  - index.md (vault structure)
  - Mode instructions (quick capture vs deep dive)

Tools: [search, read, write, move, list, recent, reminders...]

Chat history: conversation hiện tại + context từ _chats/ nếu cần
```

Claude tự plan: cần gì thì gọi tool. Trí thông minh nằm ở model.

### Flow xử lý tin nhắn

```
Bạn gõ tin nhắn
  → Chat Manager nhận, detect chế độ (quick/dive)
  → Build system prompt (profile + index + mode)
  → Gửi Claude API kèm tools
  → Claude tự dùng tools nếu cần (search, read, write...)
  → Response stream về Chat Panel
  → Nếu ghi note: tạo file .md + thêm [[wiki links]]
```

---

## 5. Smart Reminders

### Cách tạo reminder (chỉ 2 cách):

1. **Trong lúc chat** — AI nhận ra cần nhắc → gợi ý → bạn duyệt → lưu
2. **Bạn chủ động bảo** — `/scan` hoặc "review vault, set up reminders" → AI scan → đưa danh sách → bạn duyệt từng cái

AI **không bao giờ** tự ý tạo reminder hay tự scan vault.

### Cách nhắc nhở:

- Định kỳ (mỗi sáng mở Obsidian): AI chỉ đọc `_life/reminders.md` → check cái nào tới hạn → hiện trên chat panel
- Không scan cả vault, không tốn token

### Ví dụ reminders:

- "Nhắc gặp anh Minh về project X" — due: 2026-02-28
- "Review idea AI Tutor" — due: 2026-03-01
- "Goal Q1: học System Design — check progress" — due: mỗi 2 tuần

---

## 6. Retrospective

### 3 cấp độ:

- **Weekly** (`/retro week`) — tóm tắt tuần: làm gì, bỏ lỡ gì, tuần tới focus gì
- **Monthly** (`/retro month`) — so sánh với goals, phát hiện patterns
- **Quarterly** (`/retro quarter`) — bức tranh lớn: career, relationships, personal growth

### Flow một buổi retro:

```
Bạn: "/retro week"
  → AI scan vault (lúc này hợp lý vì đang retro)
  → AI trình bày từng phần, hỏi ý kiến
  → Đối thoại qua lại (như talkshow cá nhân)
  → AI tổng hợp → ghi vào _life/retro/2026-W07.md
```

Retro = **đối thoại**, không phải report một chiều.

AI đọc retro cũ để hiểu bạn thay đổi qua thời gian.

---

## 7. Roadmap

### MVP (v0.1) — Dùng được hàng ngày

- Auth (OAuth device flow)
- Chọn model (Haiku / Sonnet / Opus, auto-select theo chế độ)
- Chat panel bên phải
- Profile + Index system
- Tools: search, read, write, move, list, recent
- Quick capture mode
- Deep dive mode (`/dive`)

### v0.2 — Reminders

- Tools: create/list/complete reminder
- File `_life/reminders.md`
- Hiện reminders tới hạn khi mở Obsidian
- AI gợi ý reminder trong chat (bạn duyệt)
- `/scan` để review vault & set up reminders

### v0.3 — Retrospective

- `/retro week | month | quarter`
- AI scan vault → đối thoại → tổng hợp
- Lưu vào `_life/retro/`
- AI đọc retro cũ

### v0.4 — Telegram bot

- Quick capture qua Telegram
- Ghi vào `_inbox/` qua Dropbox API
- Cùng system prompt & tools

### v0.5+ — Tương lai

- Retro dashboard (UI floating windows)
- Vault restructure suggestions
- Và những gì nghĩ ra theo thời gian...

---

## 8. Tech decisions

- **Ngôn ngữ:** TypeScript (Obsidian plugin bắt buộc)
- **AI:** Claude API (Anthropic) với tool use
- **Auth:** OAuth device flow
- **Storage:** Obsidian vault (markdown files) trên Dropbox
- **No embedding:** Dùng agentic tool use thay vì semantic search

---

## 9. Thị trường hiện tại

Đã khảo sát: Copilot, Smart Connections, Note Companion, CAO, Claudesidian MCP, SystemSculpt, ChatGPT MD.

**Chưa ai làm tốt:**

- "Người bạn đồng hành" hiểu user qua thời gian
- Smart reminders theo context
- Retrospective tự động dạng đối thoại
- Chat-to-note với deep dive mode (AI challenge & research cùng user)

Đây là differentiator chính của plugin này.
