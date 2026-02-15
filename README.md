# Life Companion — Your AI Assistant Inside Obsidian

Turn your Obsidian vault into a personal life management system. Life Companion is an AI-powered plugin that lives right inside your notes — it can read, search, organize your vault, manage your calendar, and have meaningful conversations that actually understand your life context.

## What Can It Do?

**Chat naturally with your notes**
Ask questions about your vault, brainstorm ideas, or just have a conversation. The AI reads your notes, understands your structure, and responds with context — not generic answers.

**Manage your calendar**
Built-in calendar view with full event management. Create one-time or recurring events (daily, weekly, monthly, or custom intervals like "every 3 days"). Works seamlessly with the Full Calendar plugin.

**Two conversation modes**
- **Quick** — Fast, lightweight replies for quick questions and note capture
- **Deep Dive** — Extended thinking mode with web search, deep analysis, and multi-step reasoning. When using Claude, the AI shows its thinking process in real-time.

**Smart context management**
The AI tracks how much context it's using and automatically summarizes older messages when the conversation gets long — so you never hit a wall mid-conversation. Token usage is displayed in real-time with actual counts from the API.

**Organize your vault**
Search notes, create new ones, move files around, manage tags and properties, extract tasks — all through natural conversation. The AI shows a live activity feed of what it's doing (searching, reading, writing) so you always know what's happening.

**Multiple AI providers**
Use whichever AI you prefer: Claude, OpenAI (ChatGPT), Gemini, or Groq. Switch models anytime from the toolbar.

**Chrome-style tabs**
Run multiple conversations in parallel. Each tab remembers its own history.

**File attachments**
Drop in images, PDFs, or text files — the AI can read and discuss them.

**Bilingual**
Full English and Vietnamese support — including all tool activity descriptions.

## Getting Started

### Install

1. Clone this repo and build:
   ```bash
   git clone https://github.com/tranvuongquocdat/life-companition-AI.git
   cd life-companition-AI
   npm install && npm run build
   ```

2. Copy `main.js`, `manifest.json`, and `styles.css` into your vault:
   ```
   your-vault/.obsidian/plugins/life-companion/
   ```

3. In Obsidian, go to **Settings → Community Plugins** and enable **Life Companion**.

### Set Up an AI Provider

Go to **Settings → Life Companion** and add at least one API key:

| Provider | Where to get a key |
|----------|-------------------|
| Claude | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | [platform.openai.com](https://platform.openai.com) |
| Gemini | [aistudio.google.com](https://aistudio.google.com) |
| Groq | [console.groq.com](https://console.groq.com) |

> **macOS users with Claude Code**: You can log in without an API key using the Claude Code OAuth option in settings.

### Start Chatting

Click the Life Companion icon in the sidebar (or use the command palette). That's it — start typing and the AI will respond with full awareness of your vault.

## How the AI Works With Your Vault

On first run, the plugin creates a few helper folders:

```
_life/
├── profile.md     ← The AI learns about you over time and saves context here
├── index.md       ← A guide to your vault structure
└── retro/         ← Space for reflections and retrospectives
_inbox/            ← Quick capture inbox
_chats/            ← Your conversation history (auto-saved daily)
```

The AI uses your profile and vault index to give personalized responses. Over time, it builds up context about your preferences, projects, and how you organize things.

## Available AI Tools

The AI can perform **20+ actions** on your vault, all toggleable in settings:

- **Notes** — Search, read, create, edit, move, list folders, recent notes
- **Knowledge** — Append content, manage frontmatter properties, tags, vault stats
- **Connections** — View backlinks and outgoing links
- **Tasks** — Find tasks across notes, toggle checkboxes
- **Daily Notes** — Read or create today's daily note
- **Calendar** — Create, update, delete events with full recurring support
- **Web** — Search the web and fetch pages (Deep Dive mode)

The AI is designed to be honest about its actions — if it claims it saved or created something, it actually called the tool. If something goes wrong, you'll see a warning instead of a false confirmation.

## Development

```bash
npm run dev    # Watch mode — auto-rebuilds on changes
```

Reload Obsidian (Cmd+R / Ctrl+R) to pick up changes.

## License

MIT