# Development Setup

## Prerequisites
- Node.js >= 20
- Obsidian installed
- A dev vault (or use your personal vault with caution)

## Plugin Development (Local)

1. Clone and install:
   ```bash
   git clone https://github.com/tranvuongquocdat/life-companition-AI.git
   cd life-companition-AI
   npm install
   ```

2. Symlink plugin into your vault:
   ```bash
   ln -s "$(pwd)" /path/to/your-vault/.obsidian/plugins/life-companion
   ```

3. Start dev build (watch mode):
   ```bash
   npm run dev
   ```

4. In Obsidian:
   - Open your vault
   - Settings → Community plugins → Enable "Life Companion AI"
   - Settings → Life Companion AI → Add an API key
   - Optional: Install [hot-reload](https://github.com/pjeby/hot-reload) plugin

## Development Cycle
- Edit TypeScript in `src/`
- esbuild auto-compiles to `main.js`
- Hot-reload plugin auto-reloads, or Cmd+R to manually reload
- Open DevTools: Cmd+Option+I for debugging

## Server + Telegram Bot (Optional)

The server package adds Telegram bot access, scheduled briefings, and reminders.

1. Install server dependencies:
   ```bash
   cd packages/server && npm install
   ```

2. Create `.env` from example:
   ```bash
   cp .env.example .env
   # Edit .env with your Telegram bot token, chat ID, vault path, API keys
   ```

3. Build and run:
   ```bash
   npm run build:server
   npm run start:server
   ```

4. Or use Docker:
   ```bash
   docker-compose up -d
   ```

## Build Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Watch mode for plugin development |
| `npm run build` | Production build of Obsidian plugin |
| `npm run build:server` | Build server (installs server deps first) |
| `npm run start:server` | Start Telegram bot server |
| `npm run dev:server` | Build + run server in one step |
| `npm test` | Run tests |
