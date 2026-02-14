# Development Setup

## Prerequisites
- Node.js >= 20
- Obsidian installed
- A dev vault (NOT your personal vault)

## Setup

1. Create a dev vault (or use an existing one):
   mkdir ~/obsidian-dev-vault

2. Symlink plugin into vault:
   ln -s "/Users/dat_macbook/Documents/2025/Dự án cuộc đời" ~/obsidian-dev-vault/.obsidian/plugins/life-companion

3. Install dependencies:
   npm install

4. Start dev build (watch mode):
   npm run dev

5. In Obsidian:
   - Open the dev vault
   - Settings → Community plugins → Enable "Life Companion"
   - Optional: Install hot-reload plugin from https://github.com/pjeby/hot-reload

6. Enter your Anthropic API key:
   - Settings → Life Companion → API Key

## Development cycle
- Edit TypeScript in src/
- esbuild auto-compiles to main.js
- Hot-reload plugin auto-reloads (or manually reload Obsidian: Cmd+P → "Reload app without saving")
- Open DevTools: Cmd+Option+I for console.log debugging
