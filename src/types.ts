import type { Language } from "./i18n";

export type AIProvider = "claude" | "openai" | "gemini" | "groq";

// Any model ID string — known defaults below, but dynamic models from API are also supported
export type AIModel = string;

export type ChatMode = "quick" | "dive";

export interface ModelEntry {
  id: string;
  name: string;
}

export interface ModelGroup {
  label: string;
  provider: AIProvider;
  models: ModelEntry[];
}

export interface LifeCompanionSettings {
  // Claude Code OAuth (from macOS Keychain)
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  // API keys per provider
  claudeApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  groqApiKey: string;
  // Model selection per mode
  quickModel: AIModel;
  diveModel: AIModel;
  // Enabled models shown in chat dropdown
  enabledModels: AIModel[];
  // Enabled tools
  enabledTools: string[];
  // UI language
  language: Language;
  // Saved conversations
  savedConversations: SavedConversation[];
  // Dynamic model lists fetched from provider APIs
  customModels: Record<string, ModelEntry[]>;
  // Calendar
  calendarEventsDirectory: string;
  // Tabs
  openTabs: string[];
  activeTabId: string | null;
}

export const DEFAULT_SETTINGS: LifeCompanionSettings = {
  accessToken: "",
  refreshToken: "",
  tokenExpiresAt: 0,
  claudeApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  groqApiKey: "",
  quickModel: "gemini-3-flash-preview",
  diveModel: "claude-sonnet-4-5",
  enabledModels: ["claude-sonnet-4-5", "gpt-4.1", "gemini-3-flash-preview", "gemini-2.5-flash"],
  enabledTools: [
    "search_vault", "read_note", "write_note", "move_note",
    "list_folder", "get_recent_notes", "web_search", "web_fetch",
    "append_note", "read_properties", "update_properties",
    "get_tags", "search_by_tag", "get_vault_stats",
    "get_backlinks", "get_outgoing_links",
    "get_tasks", "toggle_task",
    "get_daily_note", "create_daily_note",
    "check_calendar_status", "get_events", "create_event",
    "update_event", "delete_event", "get_upcoming_events",
  ],
  language: "en",
  savedConversations: [],
  customModels: {},
  calendarEventsDirectory: "calendar",
  openTabs: [],
  activeTabId: null,
};

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-haiku-4-5": 200000,
  "claude-sonnet-4-5": 200000,
  "claude-opus-4-6": 200000,
  "gpt-5.2": 400000,
  "gpt-5": 400000,
  "gpt-5-mini": 400000,
  "gpt-5-nano": 400000,
  "gpt-4.1-nano": 1000000,
  "gpt-4.1-mini": 1000000,
  "gpt-4.1": 1000000,
  "o4-mini": 200000,
  "o3": 200000,
  "gemini-2.5-flash": 1000000,
  "gemini-2.5-pro": 1000000,
  "gemini-3-flash-preview": 1000000,
  "gemini-3-pro-preview": 1000000,
  "llama-3.3-70b-versatile": 128000,
  "llama-3.1-8b-instant": 128000,
};

export function getProvider(model: AIModel): AIProvider {
  if (model.startsWith("claude-")) return "claude";
  if (model.startsWith("gpt-") || model.startsWith("o3") || model.startsWith("o4") || model.startsWith("o1")) return "openai";
  if (model.startsWith("gemini-")) return "gemini";
  if (model.startsWith("llama-") || model.startsWith("mixtral-")) return "groq";
  return "claude";
}

export const MODEL_GROUPS: ModelGroup[] = [
  {
    label: "Claude",
    provider: "claude",
    models: [
      { id: "claude-haiku-4-5", name: "Haiku 4.5 — Fast" },
      { id: "claude-sonnet-4-5", name: "Sonnet 4.5 — Balanced" },
      { id: "claude-opus-4-6", name: "Opus 4.6 — Most capable" },
    ],
  },
  {
    label: "OpenAI",
    provider: "openai",
    models: [
      { id: "gpt-5-nano", name: "GPT-5 Nano — Fastest" },
      { id: "gpt-5-mini", name: "GPT-5 Mini — Fast" },
      { id: "gpt-5", name: "GPT-5 — Capable" },
      { id: "gpt-5.2", name: "GPT-5.2 — Flagship" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano — Legacy fast" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini — Legacy" },
      { id: "gpt-4.1", name: "GPT-4.1 — Legacy" },
      { id: "o4-mini", name: "o4 Mini — Fast reasoning" },
      { id: "o3", name: "o3 — Best reasoning" },
    ],
  },
  {
    label: "Gemini",
    provider: "gemini",
    models: [
      { id: "gemini-2.5-flash", name: "2.5 Flash — Fast & cheap" },
      { id: "gemini-2.5-pro", name: "2.5 Pro — Capable" },
      { id: "gemini-3-flash-preview", name: "3 Flash — Latest fast" },
      { id: "gemini-3-pro-preview", name: "3 Pro — Latest flagship" },
    ],
  },
  {
    label: "Groq",
    provider: "groq",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B — Balanced" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B — Fastest" },
    ],
  },
];

export function getEffectiveModelGroups(customModels?: Record<string, ModelEntry[]>): ModelGroup[] {
  if (!customModels || Object.keys(customModels).length === 0) return MODEL_GROUPS;
  return MODEL_GROUPS.map(group => {
    const custom = customModels[group.provider];
    if (custom && custom.length > 0) {
      return { ...group, models: custom };
    }
    return group;
  });
}

export interface ToolInfo {
  name: string;
  displayName: string;
  description: string;
  category: "vault" | "web" | "knowledge" | "graph" | "task" | "daily" | "calendar";
}

export const ALL_TOOLS: ToolInfo[] = [
  { name: "search_vault", displayName: "Search Vault", description: "Search notes by keyword", category: "vault" },
  { name: "read_note", displayName: "Read Note", description: "Read full content of a note", category: "vault" },
  { name: "write_note", displayName: "Write Note", description: "Create or overwrite notes", category: "vault" },
  { name: "move_note", displayName: "Move Note", description: "Move or rename notes", category: "vault" },
  { name: "list_folder", displayName: "List Folder", description: "Browse vault folder structure", category: "vault" },
  { name: "get_recent_notes", displayName: "Recent Notes", description: "Get recently modified notes", category: "vault" },
  { name: "web_search", displayName: "Web Search", description: "Search the web via DuckDuckGo", category: "web" },
  { name: "web_fetch", displayName: "Web Fetch", description: "Fetch and read a web page", category: "web" },
  // Knowledge
  { name: "append_note", displayName: "Append Note", description: "Append content to a note", category: "knowledge" },
  { name: "read_properties", displayName: "Read Properties", description: "Read frontmatter properties", category: "knowledge" },
  { name: "update_properties", displayName: "Update Properties", description: "Set frontmatter properties", category: "knowledge" },
  { name: "get_tags", displayName: "Get Tags", description: "List all vault tags", category: "knowledge" },
  { name: "search_by_tag", displayName: "Search by Tag", description: "Find notes by tag", category: "knowledge" },
  { name: "get_vault_stats", displayName: "Vault Stats", description: "Get vault statistics", category: "knowledge" },
  // Graph
  { name: "get_backlinks", displayName: "Backlinks", description: "Get notes linking to a note", category: "graph" },
  { name: "get_outgoing_links", displayName: "Outgoing Links", description: "Get links from a note", category: "graph" },
  // Tasks
  { name: "get_tasks", displayName: "Get Tasks", description: "Extract tasks from notes", category: "task" },
  { name: "toggle_task", displayName: "Toggle Task", description: "Toggle task checkbox", category: "task" },
  // Daily
  { name: "get_daily_note", displayName: "Get Daily Note", description: "Read today's daily note", category: "daily" },
  { name: "create_daily_note", displayName: "Create Daily Note", description: "Create a daily note", category: "daily" },
  // Calendar
  { name: "check_calendar_status", displayName: "Calendar Status", description: "Check Full Calendar plugin status", category: "calendar" },
  { name: "get_events", displayName: "Get Events", description: "Get calendar events for a date/range", category: "calendar" },
  { name: "create_event", displayName: "Create Event", description: "Create a calendar event", category: "calendar" },
  { name: "update_event", displayName: "Update Event", description: "Update an event's properties", category: "calendar" },
  { name: "delete_event", displayName: "Delete Event", description: "Delete a calendar event", category: "calendar" },
  { name: "get_upcoming_events", displayName: "Upcoming Events", description: "Get events for next N days", category: "calendar" },
];

export const TOOL_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, t.displayName])
);

// ─── Attachments ──────────────────────────────────────────────

export type AttachmentType = "image" | "pdf" | "text";

/** Full attachment with data — lives only in memory during send */
export interface Attachment {
  name: string;
  mimeType: string;
  type: AttachmentType;
  /** Base64 for images/PDFs, raw text for text files */
  data: string;
  size: number;
}

/** Lightweight ref stored in saved conversations (no data) */
export interface AttachmentRef {
  name: string;
  type: AttachmentType;
  mimeType: string;
}

export function resolveAttachmentType(mimeType: string): AttachmentType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  return "text";
}

export const SUPPORTED_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  md: "text/markdown",
  txt: "text/plain",
};

export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB

// ─── Messages ──────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  attachmentRefs?: AttachmentRef[];
}

export interface SimpleMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationState {
  id: string;
  title: string;
  messages: ChatMessage[];
  history: SimpleMessage[];
  mode: ChatMode;
  model: AIModel;
  createdAt: number;
  updatedAt: number;
}

export interface SavedConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  mode: ChatMode;
  model: AIModel;
  createdAt: number;
  updatedAt: number;
}
