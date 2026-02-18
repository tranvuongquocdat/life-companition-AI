import type { ChatMode } from "@life-companion/core";

export interface ServerConfig {
  telegramBotToken: string;
  telegramChatId: string;
  vaultPath: string;
  port: number;
  // Auth
  claudeAccessToken?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  // Scheduling
  morningBriefingHour: number;
  eveningRecapHour: number;
  timezone: string;
  // AI preferences
  defaultModel: string;
  chatMode: ChatMode;
  language: string;
}

export function loadConfig(): ServerConfig {
  return {
    telegramBotToken: env("TELEGRAM_BOT_TOKEN"),
    telegramChatId: env("TELEGRAM_CHAT_ID"),
    vaultPath: env("VAULT_PATH", "/data/vault"),
    port: parseInt(env("PORT", "3456")),
    claudeAccessToken: process.env.CLAUDE_ACCESS_TOKEN,
    claudeApiKey: process.env.CLAUDE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    morningBriefingHour: parseInt(env("MORNING_HOUR", "7")),
    eveningRecapHour: parseInt(env("EVENING_HOUR", "21")),
    timezone: env("TZ", "Asia/Ho_Chi_Minh"),
    defaultModel: env("DEFAULT_MODEL", "claude-sonnet-4-20250514"),
    chatMode: (process.env.CHAT_MODE as ChatMode) || "quick",
    language: env("LANGUAGE", "vi"),
  };
}

function env(key: string, fallback?: string): string {
  const val = process.env[key] || fallback;
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}
