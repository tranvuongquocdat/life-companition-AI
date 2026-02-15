# Life Companion MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Obsidian plugin that acts as an AI life companion — chat panel on the right, Claude API with tool use to read/write/organize notes in the vault, with quick capture and deep dive modes.

**Architecture:** Obsidian plugin (TypeScript) with a right-side chat panel. Claude API with tool use (agentic approach) — Claude gets tools to search/read/write vault files and decides when to use them. Profile + Index system for personalization. No embedding, no complex search — Claude's reasoning handles context finding.

**Tech Stack:** TypeScript, Obsidian API, @anthropic-ai/sdk, esbuild, vitest (for pure logic tests)

**Design Doc:** `docs/plans/2026-02-14-life-companion-design.md`

---

## Task 1: Project Scaffold

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `src/main.ts`
- Create: `styles.css`
- Create: `.gitignore`

**Step 1: Initialize git repo**

```bash
cd "/Users/dat_macbook/Documents/2025/Dự án cuộc đời"
git init
```

**Step 2: Create manifest.json**

```json
{
  "id": "life-companion",
  "name": "Life Companion",
  "version": "0.1.0",
  "minAppVersion": "1.0.0",
  "description": "AI-powered life companion — brainstorm, organize notes, and reflect on your life with Claude.",
  "author": "Dat",
  "isDesktopOnly": true
}
```

**Step 3: Create package.json**

```json
{
  "name": "life-companion",
  "version": "0.1.0",
  "description": "AI life companion Obsidian plugin",
  "main": "main.js",
  "type": "module",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@types/node": "^22.0.0",
    "esbuild": "^0.25.0",
    "obsidian": "latest",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  },
  "dependencies": {}
}
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2018",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "lib": ["DOM", "ES2018", "ES2021.String"]
  },
  "include": ["src/**/*.ts"]
}
```

**Step 5: Create esbuild.config.mjs**

```javascript
import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

**Step 6: Create src/main.ts (minimal plugin)**

```typescript
import { Plugin } from "obsidian";

export default class LifeCompanionPlugin extends Plugin {
  async onload() {
    console.log("Life Companion loaded");
  }

  async onunload() {
    console.log("Life Companion unloaded");
  }
}
```

**Step 7: Create styles.css (empty for now)**

```css
/* Life Companion styles */
```

**Step 8: Create .gitignore**

```
node_modules/
main.js
*.js.map
.DS_Store
```

**Step 9: Install dependencies and verify build**

```bash
npm install
npm run build
```

Expected: Build succeeds, `main.js` is created.

**Step 10: Commit**

```bash
git add manifest.json package.json tsconfig.json esbuild.config.mjs src/main.ts styles.css .gitignore
git commit -m "feat: scaffold obsidian plugin project"
```

---

## Task 2: Types & Settings

**Files:**
- Create: `src/types.ts`
- Create: `src/settings.ts`
- Modify: `src/main.ts`

**Step 1: Create src/types.ts**

```typescript
export type ClaudeModel = "claude-haiku-4-5" | "claude-sonnet-4-5" | "claude-opus-4-6";

export type ChatMode = "quick" | "dive";

export interface LifeCompanionSettings {
  apiKey: string;
  defaultModel: ClaudeModel;
  quickModel: ClaudeModel;
  diveModel: ClaudeModel;
}

export const DEFAULT_SETTINGS: LifeCompanionSettings = {
  apiKey: "",
  defaultModel: "claude-sonnet-4-5",
  quickModel: "claude-haiku-4-5",
  diveModel: "claude-sonnet-4-5",
};

export const MODEL_DISPLAY_NAMES: Record<ClaudeModel, string> = {
  "claude-haiku-4-5": "Haiku 4.5 (Fast, cheap)",
  "claude-sonnet-4-5": "Sonnet 4.5 (Balanced)",
  "claude-opus-4-6": "Opus 4.6 (Most capable)",
};

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
```

**Step 2: Create src/settings.ts**

```typescript
import { App, PluginSettingTab, Setting } from "obsidian";
import type LifeCompanionPlugin from "./main";
import { MODEL_DISPLAY_NAMES, type ClaudeModel } from "./types";

export class LifeCompanionSettingTab extends PluginSettingTab {
  plugin: LifeCompanionPlugin;

  constructor(app: App, plugin: LifeCompanionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Life Companion Settings" });

    // API Key
    new Setting(containerEl)
      .setName("Anthropic API Key")
      .setDesc("Get your key from console.anthropic.com")
      .addText((text) =>
        text
          .setPlaceholder("sk-ant-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    // Quick capture model
    new Setting(containerEl)
      .setName("Quick Capture Model")
      .setDesc("Model for quick note-taking (fast & cheap recommended)")
      .addDropdown((dropdown) => {
        for (const [id, name] of Object.entries(MODEL_DISPLAY_NAMES)) {
          dropdown.addOption(id, name);
        }
        dropdown.setValue(this.plugin.settings.quickModel);
        dropdown.onChange(async (value) => {
          this.plugin.settings.quickModel = value as ClaudeModel;
          await this.plugin.saveSettings();
        });
      });

    // Deep dive model
    new Setting(containerEl)
      .setName("Deep Dive Model")
      .setDesc("Model for brainstorming & deep thinking (more capable recommended)")
      .addDropdown((dropdown) => {
        for (const [id, name] of Object.entries(MODEL_DISPLAY_NAMES)) {
          dropdown.addOption(id, name);
        }
        dropdown.setValue(this.plugin.settings.diveModel);
        dropdown.onChange(async (value) => {
          this.plugin.settings.diveModel = value as ClaudeModel;
          await this.plugin.saveSettings();
        });
      });
  }
}
```

**Step 3: Update src/main.ts to load settings**

```typescript
import { Plugin } from "obsidian";
import { LifeCompanionSettingTab } from "./settings";
import { DEFAULT_SETTINGS, type LifeCompanionSettings } from "./types";

export default class LifeCompanionPlugin extends Plugin {
  settings: LifeCompanionSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LifeCompanionSettingTab(this.app, this));
    console.log("Life Companion loaded");
  }

  async onunload() {
    console.log("Life Companion unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

**Step 4: Build and verify**

```bash
npm run build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/types.ts src/settings.ts src/main.ts
git commit -m "feat: add settings page with API key and model selection"
```

---

## Task 3: Chat Panel View (UI Shell)

**Files:**
- Create: `src/ChatView.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`

**Step 1: Create src/ChatView.ts**

```typescript
import { ItemView, WorkspaceLeaf } from "obsidian";
import type LifeCompanionPlugin from "./main";
import type { ChatMessage, ChatMode } from "./types";

export const VIEW_TYPE_CHAT = "life-companion-chat";

export class ChatView extends ItemView {
  plugin: LifeCompanionPlugin;
  private messagesContainer: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private modeToggle: HTMLButtonElement;
  private mode: ChatMode = "quick";
  private messages: ChatMessage[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: LifeCompanionPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText(): string {
    return "Life Companion";
  }

  getIcon(): string {
    return "message-circle";
  }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass("life-companion-container");

    // Header
    const header = container.createDiv({ cls: "lc-header" });
    header.createEl("h4", { text: "Life Companion" });

    this.modeToggle = header.createEl("button", {
      cls: "lc-mode-toggle",
      text: "Quick",
    });
    this.modeToggle.addEventListener("click", () => this.toggleMode());

    // Messages area
    this.messagesContainer = container.createDiv({ cls: "lc-messages" });

    // Welcome message
    this.addAssistantMessage("Chào bạn! Mình là Life Companion. Hãy nhắn gì đó, hoặc gõ `/dive` để vào chế độ deep dive.");

    // Input area
    const inputArea = container.createDiv({ cls: "lc-input-area" });

    this.inputEl = inputArea.createEl("textarea", {
      cls: "lc-input",
      placeholder: "Nhắn gì đó...",
      attr: { rows: "3" },
    });

    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.sendBtn = inputArea.createEl("button", {
      cls: "lc-send-btn",
      text: "Gửi",
    });
    this.sendBtn.addEventListener("click", () => this.handleSend());
  }

  async onClose() {
    this.contentEl.empty();
  }

  private toggleMode() {
    this.mode = this.mode === "quick" ? "dive" : "quick";
    this.modeToggle.textContent = this.mode === "quick" ? "Quick" : "Deep Dive";
    this.modeToggle.toggleClass("lc-mode-dive", this.mode === "dive");
  }

  private async handleSend() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    // Check for /dive command
    if (text === "/dive") {
      this.mode = "dive";
      this.modeToggle.textContent = "Deep Dive";
      this.modeToggle.addClass("lc-mode-dive");
      this.addAssistantMessage("Đã chuyển sang chế độ Deep Dive. Mình sẽ cùng bạn brainstorm, research và challenge ý tưởng trước khi ghi note.");
      this.inputEl.value = "";
      return;
    }

    if (text === "/quick") {
      this.mode = "quick";
      this.modeToggle.textContent = "Quick";
      this.modeToggle.removeClass("lc-mode-dive");
      this.addAssistantMessage("Đã chuyển sang chế độ Quick Capture.");
      this.inputEl.value = "";
      return;
    }

    this.inputEl.value = "";
    this.addUserMessage(text);

    // Disable input while processing
    this.inputEl.disabled = true;
    this.sendBtn.disabled = true;

    try {
      await this.plugin.handleMessage(text, this.mode, this);
    } finally {
      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
      this.inputEl.focus();
    }
  }

  addUserMessage(text: string) {
    const msg: ChatMessage = { role: "user", content: text, timestamp: Date.now() };
    this.messages.push(msg);
    const el = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-user" });
    el.textContent = text;
    this.scrollToBottom();
  }

  addAssistantMessage(text: string) {
    const msg: ChatMessage = { role: "assistant", content: text, timestamp: Date.now() };
    this.messages.push(msg);
    const el = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-assistant" });
    el.textContent = text;
    this.scrollToBottom();
  }

  createStreamingMessage(): HTMLElement {
    const el = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-assistant" });
    this.scrollToBottom();
    return el;
  }

  private scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
}
```

**Step 2: Update styles.css**

```css
.life-companion-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
}

.lc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.lc-header h4 {
  margin: 0;
  font-size: 14px;
}

.lc-mode-toggle {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  cursor: pointer;
}

.lc-mode-dive {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.lc-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lc-msg {
  padding: 8px 12px;
  border-radius: 8px;
  max-width: 90%;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.lc-msg-user {
  align-self: flex-end;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.lc-msg-assistant {
  align-self: flex-start;
  background: var(--background-secondary);
}

.lc-input-area {
  padding: 8px 12px;
  border-top: 1px solid var(--background-modifier-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lc-input {
  width: 100%;
  resize: vertical;
  min-height: 50px;
  font-size: 13px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
}

.lc-send-btn {
  align-self: flex-end;
  padding: 4px 16px;
  border-radius: 6px;
  cursor: pointer;
}
```

**Step 3: Update src/main.ts — register view**

```typescript
import { Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { LifeCompanionSettingTab } from "./settings";
import { DEFAULT_SETTINGS, type ChatMode, type LifeCompanionSettings } from "./types";

export default class LifeCompanionPlugin extends Plugin {
  settings: LifeCompanionSettings;

  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

    this.addRibbonIcon("message-circle", "Life Companion", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-chat",
      name: "Open Life Companion",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new LifeCompanionSettingTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
  }

  async activateView() {
    const { workspace } = this.app;
    workspace.detachLeavesOfType(VIEW_TYPE_CHAT);

    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async handleMessage(text: string, mode: ChatMode, view: ChatView) {
    // Placeholder — will be implemented in Task 5
    view.addAssistantMessage("(Claude API chưa kết nối — sẽ implement ở bước tiếp)");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

**Step 4: Build and verify**

```bash
npm run build
```

Expected: Build succeeds. Plugin shows chat panel on the right when activated.

**Step 5: Manual test in Obsidian**

- Open Obsidian dev vault
- Enable plugin
- Click ribbon icon → chat panel opens on the right
- Type message → appears in chat
- `/dive` → switches to Deep Dive mode
- `/quick` → switches back

**Step 6: Commit**

```bash
git add src/ChatView.ts src/main.ts styles.css
git commit -m "feat: add chat panel view with quick/dive mode toggle"
```

---

## Task 4: Vault Tools

**Files:**
- Create: `src/vault-tools.ts`
- Create: `src/tests/vault-tools.test.ts`

**Step 1: Create src/vault-tools.ts**

This implements the actual tool functions that interact with the Obsidian vault.

```typescript
import { App, TFile, TFolder, TAbstractFile, Vault } from "obsidian";

export class VaultTools {
  constructor(private app: App) {}

  async searchVault(query: string): Promise<string> {
    const files = this.app.vault.getMarkdownFiles();
    const results: { path: string; matches: string[] }[] = [];
    const queryLower = query.toLowerCase();

    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const lines = content.split("\n");
      const matches: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          matches.push(`L${i + 1}: ${lines[i].trim()}`);
        }
      }

      // Also match on filename
      if (file.path.toLowerCase().includes(queryLower)) {
        matches.unshift(`[filename match]`);
      }

      if (matches.length > 0) {
        results.push({ path: file.path, matches: matches.slice(0, 5) });
      }
    }

    if (results.length === 0) {
      return `No results found for "${query}".`;
    }

    return results
      .slice(0, 20)
      .map((r) => `## ${r.path}\n${r.matches.join("\n")}`)
      .join("\n\n");
  }

  async readNote(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      return `File not found: ${path}`;
    }
    const content = await this.app.vault.read(file);
    return content;
  }

  async writeNote(path: string, content: string): Promise<string> {
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing && existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return `Updated: ${path}`;
    }

    // Ensure parent folder exists
    const folderPath = path.substring(0, path.lastIndexOf("/"));
    if (folderPath) {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }
    }

    await this.app.vault.create(path, content);
    return `Created: ${path}`;
  }

  async moveNote(from: string, to: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!file) {
      return `File not found: ${from}`;
    }

    // Ensure target folder exists
    const folderPath = to.substring(0, to.lastIndexOf("/"));
    if (folderPath) {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }
    }

    await this.app.vault.rename(file, to);
    return `Moved: ${from} → ${to}`;
  }

  async listFolder(path: string): Promise<string> {
    const targetPath = path || "/";
    const folder = targetPath === "/"
      ? this.app.vault.getRoot()
      : this.app.vault.getAbstractFileByPath(targetPath);

    if (!folder || !(folder instanceof TFolder)) {
      return `Folder not found: ${path}`;
    }

    const items: string[] = [];
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        items.push(`📁 ${child.name}/`);
      } else if (child instanceof TFile) {
        items.push(`📄 ${child.name}`);
      }
    }

    return items.length > 0 ? items.join("\n") : "(empty folder)";
  }

  async getRecentNotes(days: number): Promise<string> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const files = this.app.vault.getMarkdownFiles();

    const recent = files
      .filter((f) => f.stat.mtime > cutoff)
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 30);

    if (recent.length === 0) {
      return `No notes modified in the last ${days} days.`;
    }

    return recent
      .map((f) => {
        const date = new Date(f.stat.mtime).toISOString().split("T")[0];
        return `${date} — ${f.path}`;
      })
      .join("\n");
  }
}
```

**Step 2: Build and verify**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/vault-tools.ts
git commit -m "feat: implement vault tools (search, read, write, move, list, recent)"
```

---

## Task 5: Claude API Client with Tool Use

**Files:**
- Create: `src/claude.ts`
- Create: `src/tool-definitions.ts`

**Step 1: Create src/tool-definitions.ts**

Tool schemas that get sent to the Claude API.

```typescript
import type Anthropic from "@anthropic-ai/sdk";

export const VAULT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_vault",
    description:
      "Search for notes in the vault by keyword. Returns matching file paths and line content. Use this to find relevant notes before reading them.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The keyword or phrase to search for across all notes",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_note",
    description:
      "Read the full content of a specific note. Use this after search_vault to read relevant notes, or when you know the exact path.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "The file path relative to vault root, e.g. 'ideas/side-projects/ai-tutor.md'",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_note",
    description:
      "Create a new note or overwrite an existing note. Creates parent folders automatically. Use [[wiki links]] to link to other notes. IMPORTANT: Always ask the user for confirmation before writing.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File path relative to vault root, e.g. 'ideas/side-projects/ai-tutor.md'",
        },
        content: {
          type: "string",
          description: "The full markdown content to write. Use [[wiki links]] for cross-references.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "move_note",
    description:
      "Move or rename a note to a new path. Creates target folders automatically. IMPORTANT: Always ask the user for confirmation before moving.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: {
          type: "string",
          description: "Current file path",
        },
        to: {
          type: "string",
          description: "New file path",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "list_folder",
    description:
      "List files and subfolders in a specific folder. Use this to explore vault structure.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Folder path relative to vault root, e.g. 'ideas/' or '' for root",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "get_recent_notes",
    description:
      "Get recently modified notes within a time period. Useful for reviews and understanding recent activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back, e.g. 7 for last week",
        },
      },
      required: ["days"],
    },
  },
];
```

**Step 2: Create src/claude.ts**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ChatMode, ClaudeModel } from "./types";
import type { VaultTools } from "./vault-tools";
import { VAULT_TOOLS } from "./tool-definitions";

interface SendMessageOptions {
  userMessage: string;
  mode: ChatMode;
  model: ClaudeModel;
  systemPrompt: string;
  conversationHistory: Anthropic.MessageParam[];
  vaultTools: VaultTools;
  onText: (text: string) => void;
  onToolUse: (toolName: string, input: Record<string, unknown>) => void;
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  updateApiKey(apiKey: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async sendMessage(options: SendMessageOptions): Promise<string> {
    const {
      userMessage,
      mode,
      model,
      systemPrompt,
      conversationHistory,
      vaultTools,
      onText,
      onToolUse,
    } = options;

    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    let fullResponse = "";

    // Agentic loop — keep going while Claude wants to use tools
    while (true) {
      const response = await this.client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: VAULT_TOOLS,
        messages,
      });

      // Collect text and tool_use blocks
      const textParts: string[] = [];
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          textParts.push(block.text);
          onText(block.text);
        } else if (block.type === "tool_use") {
          toolUseBlocks.push(block);
          onToolUse(block.name, block.input as Record<string, unknown>);
        }
      }

      fullResponse += textParts.join("");

      // Add assistant response to messages
      messages.push({ role: "assistant", content: response.content });

      // If no tool calls, we're done
      if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
        break;
      }

      // Execute tool calls and send results back
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const result = await this.executeTool(toolUse, vaultTools);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    return fullResponse;
  }

  private async executeTool(
    toolUse: Anthropic.ToolUseBlock,
    vaultTools: VaultTools
  ): Promise<string> {
    const input = toolUse.input as Record<string, unknown>;

    try {
      switch (toolUse.name) {
        case "search_vault":
          return await vaultTools.searchVault(input.query as string);
        case "read_note":
          return await vaultTools.readNote(input.path as string);
        case "write_note":
          return await vaultTools.writeNote(
            input.path as string,
            input.content as string
          );
        case "move_note":
          return await vaultTools.moveNote(
            input.from as string,
            input.to as string
          );
        case "list_folder":
          return await vaultTools.listFolder(input.path as string);
        case "get_recent_notes":
          return await vaultTools.getRecentNotes(input.days as number);
        default:
          return `Unknown tool: ${toolUse.name}`;
      }
    } catch (error) {
      return `Error executing ${toolUse.name}: ${(error as Error).message}`;
    }
  }
}
```

**Step 3: Build and verify**

```bash
npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/tool-definitions.ts src/claude.ts
git commit -m "feat: implement Claude API client with agentic tool use loop"
```

---

## Task 6: Profile & System Prompt

**Files:**
- Create: `src/prompts.ts`
- Create: `src/profile.ts`

**Step 1: Create src/prompts.ts**

```typescript
import type { ChatMode } from "./types";

export function buildSystemPrompt(
  profile: string,
  index: string,
  mode: ChatMode
): string {
  const modeInstructions =
    mode === "quick"
      ? QUICK_MODE_INSTRUCTIONS
      : DIVE_MODE_INSTRUCTIONS;

  return `${BASE_PROMPT}

## Về người dùng (Profile)
${profile || "(Chưa có profile. Hãy hỏi người dùng về bản thân họ và gợi ý tạo profile.)"}

## Cấu trúc Vault (Index)
${index || "(Vault chưa có cấu trúc. Hãy gợi ý tạo cấu trúc cơ bản.)"}

## Chế độ hiện tại
${modeInstructions}`;
}

const BASE_PROMPT = `Bạn là Life Companion — người bạn đồng hành AI trong Obsidian.

## Tính cách
- Nói chuyện tự nhiên, thân thiện, bằng tiếng Việt (trừ khi user nói tiếng Anh)
- Thẳng thắn, không nịnh bợ — sẵn sàng challenge ý tưởng nếu cần
- Phân tích sâu, đưa ra góc nhìn mà user chưa nghĩ tới

## Nguyên tắc
- KHÔNG BAO GIỜ tự ý write_note hoặc move_note mà không hỏi user trước
- Khi ghi note, dùng [[wiki links]] để liên kết tới các note liên quan
- Ghi note rõ ràng, informative — user đọc lại phải hiểu ngay
- Nếu user nhắn nhanh → phân loại và lưu. Nếu ý tưởng phức tạp → hỏi thêm trước khi ghi

## Tools
Bạn có các tools để tương tác với vault. Hãy dùng chúng khi cần:
- search_vault: tìm note liên quan
- read_note: đọc nội dung note
- write_note: tạo/sửa note (LUÔN hỏi user trước)
- move_note: di chuyển note (LUÔN hỏi user trước)
- list_folder: xem cấu trúc vault
- get_recent_notes: xem note gần đây`;

const QUICK_MODE_INSTRUCTIONS = `**Quick Capture Mode**
- User muốn ghi nhanh, không cần thảo luận sâu
- Phân loại note vào đúng folder dựa trên index
- Hỏi ngắn gọn nếu chưa rõ nên đặt ở đâu
- Ghi note ngắn, rõ ràng, có [[wiki links]]
- Nhanh gọn, không lan man`;

const DIVE_MODE_INSTRUCTIONS = `**Deep Dive Mode**
- User muốn brainstorm, thảo luận sâu
- Hỏi thêm câu hỏi để làm rõ ý tưởng
- Search web nếu cần (sẽ có tool sau)
- Challenge ý tưởng — đưa ra counter-arguments, góc nhìn khác
- Khi đã thảo luận đủ, đề xuất ghi lại thành note chất lượng cao
- Note phải rõ ràng, có cấu trúc, informative — đọc lại sau vẫn hiểu`;
```

**Step 2: Create src/profile.ts**

Handles reading/initializing the `_life/` folder system.

```typescript
import { App, TFile, TFolder } from "obsidian";

const PROFILE_PATH = "_life/profile.md";
const INDEX_PATH = "_life/index.md";

const DEFAULT_PROFILE = `# Profile

(Life Companion sẽ giúp bạn điền profile này qua các cuộc trò chuyện)

## Về bạn
- Tên:
- Tuổi:
- Nghề nghiệp:

## Mục tiêu hiện tại
-

## Ưu tiên
-

## Phong cách ghi chú
-
`;

const DEFAULT_INDEX = `# Vault Index

> AI đọc file này để biết cấu trúc vault. Cập nhật khi vault thay đổi.

## Domains
- ideas/ → Ý tưởng chưa thực hiện (side-projects, freelance, company)
- projects/ → Đang thực hiện / đã thực hiện
- career/ → Skills, goals, opportunities
- relationships/ → Gia đình, bạn bè, đối tác
- personal/ → Health, finance, habits
- books/ → Đang đọc, đã đọc, muốn đọc

## Special Folders
- _inbox/ → Quick capture, AI phân loại sau
- _chats/ → Lịch sử chat AI
- _life/ → Profile, index, reminders, retro
- _life/retro/ → Weekly / monthly / quarterly retro notes

## Rules
- Quick capture → _inbox/, AI phân loại sau
- Mọi note dùng [[wiki links]] để liên kết chéo
- Khi domain mới xuất hiện nhiều lần → AI đề xuất tạo folder mới
`;

export class ProfileManager {
  constructor(private app: App) {}

  async ensureLifeFolder(): Promise<void> {
    const lifeFolder = this.app.vault.getAbstractFileByPath("_life");
    if (!lifeFolder) {
      await this.app.vault.createFolder("_life");
    }

    const retroFolder = this.app.vault.getAbstractFileByPath("_life/retro");
    if (!retroFolder) {
      await this.app.vault.createFolder("_life/retro");
    }

    const inboxFolder = this.app.vault.getAbstractFileByPath("_inbox");
    if (!inboxFolder) {
      await this.app.vault.createFolder("_inbox");
    }

    const chatsFolder = this.app.vault.getAbstractFileByPath("_chats");
    if (!chatsFolder) {
      await this.app.vault.createFolder("_chats");
    }
  }

  async getProfile(): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(PROFILE_PATH);
    if (file && file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    // Create default profile
    await this.ensureLifeFolder();
    await this.app.vault.create(PROFILE_PATH, DEFAULT_PROFILE);
    return DEFAULT_PROFILE;
  }

  async getIndex(): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(INDEX_PATH);
    if (file && file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    // Create default index
    await this.ensureLifeFolder();
    await this.app.vault.create(INDEX_PATH, DEFAULT_INDEX);
    return DEFAULT_INDEX;
  }
}
```

**Step 3: Build and verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/prompts.ts src/profile.ts
git commit -m "feat: add system prompt builder and profile/index manager"
```

---

## Task 7: Wire Everything Together

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ChatView.ts`

**Step 1: Update src/main.ts — full integration**

```typescript
import { Notice, Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ChatView";
import { ClaudeClient } from "./claude";
import { ProfileManager } from "./profile";
import { buildSystemPrompt } from "./prompts";
import { LifeCompanionSettingTab } from "./settings";
import {
  DEFAULT_SETTINGS,
  type ChatMode,
  type LifeCompanionSettings,
} from "./types";
import { VaultTools } from "./vault-tools";
import type Anthropic from "@anthropic-ai/sdk";

export default class LifeCompanionPlugin extends Plugin {
  settings: LifeCompanionSettings;
  claudeClient: ClaudeClient | null = null;
  vaultTools: VaultTools;
  profileManager: ProfileManager;
  conversationHistory: Anthropic.MessageParam[] = [];

  async onload() {
    await this.loadSettings();

    this.vaultTools = new VaultTools(this.app);
    this.profileManager = new ProfileManager(this.app);

    if (this.settings.apiKey) {
      this.claudeClient = new ClaudeClient(this.settings.apiKey);
    }

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

    this.addRibbonIcon("message-circle", "Life Companion", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-chat",
      name: "Open Life Companion",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new LifeCompanionSettingTab(this.app, this));

    // Ensure _life/ folder structure exists
    this.app.workspace.onLayoutReady(async () => {
      await this.profileManager.ensureLifeFolder();
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
  }

  async activateView() {
    const { workspace } = this.app;
    workspace.detachLeavesOfType(VIEW_TYPE_CHAT);

    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async handleMessage(text: string, mode: ChatMode, view: ChatView) {
    if (!this.settings.apiKey) {
      view.addAssistantMessage(
        "Chưa có API key. Vào Settings → Life Companion để nhập API key nhé."
      );
      return;
    }

    if (!this.claudeClient) {
      this.claudeClient = new ClaudeClient(this.settings.apiKey);
    }

    const model = mode === "quick" ? this.settings.quickModel : this.settings.diveModel;

    try {
      const profile = await this.profileManager.getProfile();
      const index = await this.profileManager.getIndex();
      const systemPrompt = buildSystemPrompt(profile, index, mode);

      const streamEl = view.createStreamingMessage();
      let accumulatedText = "";

      const response = await this.claudeClient.sendMessage({
        userMessage: text,
        mode,
        model,
        systemPrompt,
        conversationHistory: this.conversationHistory,
        vaultTools: this.vaultTools,
        onText: (chunk) => {
          accumulatedText += chunk;
          streamEl.textContent = accumulatedText;
          view.scrollToBottom();
        },
        onToolUse: (name, input) => {
          // Show tool usage in UI
          const toolMsg = `🔧 Using ${name}...`;
          if (!accumulatedText.includes(toolMsg)) {
            accumulatedText += `\n${toolMsg}\n`;
            streamEl.textContent = accumulatedText;
          }
        },
      });

      // Update conversation history
      this.conversationHistory.push(
        { role: "user", content: text },
        { role: "assistant", content: response }
      );

      // Keep history manageable (last 20 messages)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      view.addAssistantMessage(`Lỗi: ${msg}`);
      new Notice(`Life Companion error: ${msg}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Update client if API key changed
    if (this.settings.apiKey) {
      if (this.claudeClient) {
        this.claudeClient.updateApiKey(this.settings.apiKey);
      } else {
        this.claudeClient = new ClaudeClient(this.settings.apiKey);
      }
    }
  }
}
```

**Step 2: Add scrollToBottom as public method in ChatView.ts**

Add this to the ChatView class (make `scrollToBottom` public):

```typescript
// Change from private to public
scrollToBottom() {
  this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
}
```

**Step 3: Build and verify**

```bash
npm run build
```

**Step 4: Manual test in Obsidian**

- Open plugin → chat panel
- Enter API key in settings
- Type "Hello" → should get response from Claude
- Type "list vault" → Claude should use list_folder tool
- Type `/dive` → switch to deep dive mode
- Type an idea → Claude should brainstorm and discuss with you
- Check `_life/profile.md` and `_life/index.md` were created

**Step 5: Commit**

```bash
git add src/main.ts src/ChatView.ts
git commit -m "feat: wire up Claude API, vault tools, and profile system"
```

---

## Task 8: Chat History Persistence

**Files:**
- Create: `src/chat-history.ts`
- Modify: `src/main.ts`

**Step 1: Create src/chat-history.ts**

```typescript
import { App, TFile } from "obsidian";
import type { ChatMessage } from "./types";

export class ChatHistory {
  constructor(private app: App) {}

  private getTodayPath(): string {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    return `_chats/${date}.md`;
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    const path = this.getTodayPath();
    const file = this.app.vault.getAbstractFileByPath(path);
    const time = new Date(message.timestamp).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const prefix = message.role === "user" ? "**Bạn**" : "**AI**";
    const line = `\n\n${prefix} (${time}):\n${message.content}`;

    if (file && file instanceof TFile) {
      await this.app.vault.append(file, line);
    } else {
      const header = `# Chat — ${new Date().toISOString().split("T")[0]}\n`;
      await this.app.vault.create(path, header + line);
    }
  }

  async loadTodayHistory(): Promise<string | null> {
    const path = this.getTodayPath();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file && file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }
}
```

**Step 2: Integrate into main.ts**

Add to `handleMessage` method — after getting the response, save both messages:

```typescript
// After the response, add to handleMessage:
const chatHistory = new ChatHistory(this.app);
await chatHistory.saveMessage({ role: "user", content: text, timestamp: Date.now() });
await chatHistory.saveMessage({ role: "assistant", content: response, timestamp: Date.now() });
```

Import `ChatHistory` at top of main.ts.

**Step 3: Build and verify**

```bash
npm run build
```

**Step 4: Manual test**

- Chat with AI → check `_chats/2026-02-14.md` was created
- Messages should be logged with timestamps

**Step 5: Commit**

```bash
git add src/chat-history.ts src/main.ts
git commit -m "feat: persist chat history to _chats/ folder"
```

---

## Task 9: Development Environment Setup

**Files:**
- Create: `docs/DEV-SETUP.md`

**Step 1: Create dev setup guide**

```markdown
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
```

**Step 2: Commit**

```bash
git add docs/DEV-SETUP.md
git commit -m "docs: add development setup guide"
```

---

## Task 10: Final MVP Polish

**Files:**
- Modify: `src/ChatView.ts` (add loading indicator)
- Modify: `styles.css` (polish)

**Step 1: Add loading indicator to ChatView**

Add a "thinking" indicator while Claude is processing. In `handleSend()`, show a loading message:

```typescript
// Before the try block in handleSend:
const loadingEl = this.messagesContainer.createDiv({ cls: "lc-msg lc-msg-assistant lc-loading" });
loadingEl.textContent = "Đang suy nghĩ...";
this.scrollToBottom();

// In the try block, remove the loading element before showing response:
loadingEl.remove();

// In the catch/finally, also remove it:
loadingEl.remove();
```

**Step 2: Add loading styles**

```css
.lc-loading {
  opacity: 0.6;
  font-style: italic;
}
```

**Step 3: Build, test, commit**

```bash
npm run build
git add src/ChatView.ts styles.css
git commit -m "feat: add loading indicator while AI is thinking"
```

---

## Summary

### MVP delivers:
1. ✅ Obsidian plugin with chat panel on the right
2. ✅ API key authentication
3. ✅ Model selection (Haiku/Sonnet/Opus) per mode
4. ✅ Quick capture mode (default)
5. ✅ Deep dive mode (`/dive`)
6. ✅ Claude API with agentic tool use
7. ✅ Vault tools: search, read, write, move, list, recent
8. ✅ Profile + Index system (`_life/`)
9. ✅ Chat history persistence (`_chats/`)
10. ✅ Auto-creates folder structure on first run

### Total tasks: 10
### Estimated files: ~12 source files
### Key dependencies: @anthropic-ai/sdk, obsidian API

### Post-MVP (v0.2+):
- OAuth PKCE authentication (replace API key paste)
- Reminder tools (create/list/complete)
- Retrospective commands (`/retro week`)
- Telegram bot integration
- Markdown rendering in chat messages
- Streaming responses (currently waits for full response)
