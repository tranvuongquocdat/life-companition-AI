import { access } from "fs/promises";
import express from "express";
import { AIClient, type HttpRequestOptions } from "@life-companion/core";
import { loadConfig } from "./config";
import { ServerVaultTools } from "./vault-tools";
import { ServerCalendarManager } from "./calendar-manager";
import { createToolExecutor } from "./tool-executor";
import { TelegramBotHandler } from "./telegram";
import { Scheduler } from "./scheduler";

(async () => {
  const config = loadConfig();

  // Validate vault path exists
  try {
    await access(config.vaultPath);
  } catch {
    console.error(`ERROR: Vault path does not exist: ${config.vaultPath}`);
    console.error("Create the directory or set VAULT_PATH correctly in .env");
    process.exit(1);
  }

  // Warn if no AI provider configured
  if (
    !config.claudeAccessToken && !config.claudeApiKey &&
    !config.openaiApiKey && !config.geminiApiKey && !config.groqApiKey
  ) {
    console.warn("WARNING: No AI provider API key configured. Bot will not be able to respond.");
  }

  // HttpClient using native fetch (Node 20+)
  const httpClient = async (req: HttpRequestOptions) => {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, text, json };
  };

  // Initialize AI client
  const aiClient = new AIClient({
    claudeAccessToken: config.claudeAccessToken,
    claudeApiKey: config.claudeApiKey,
    openaiApiKey: config.openaiApiKey,
    geminiApiKey: config.geminiApiKey,
    groqApiKey: config.groqApiKey,
  }, httpClient);

  // Initialize vault tools & calendar
  const vaultTools = new ServerVaultTools(config.vaultPath);
  const calendarManager = new ServerCalendarManager(config.vaultPath);

  // Set embedding keys if available
  vaultTools.setEmbeddingKeys({
    openai: config.openaiApiKey,
    gemini: config.geminiApiKey,
  });

  // Tool executor
  const toolExecutor = createToolExecutor(vaultTools, calendarManager);

  // Telegram bot
  const telegramBot = new TelegramBotHandler(
    config, aiClient, vaultTools, calendarManager, toolExecutor,
  );

  // Scheduler
  const scheduler = new Scheduler(
    config, telegramBot.getBot(), aiClient, vaultTools, calendarManager,
  );
  scheduler.start();

  // Express — health check
  const app = express();

  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
    });
  });

  app.listen(config.port, () => {
    console.log(`Life Companion Server running on port ${config.port}`);
    console.log(`Vault: ${config.vaultPath}`);
    console.log(`Model: ${config.defaultModel}`);
    console.log(`Telegram bot active, chat ID: ${config.telegramChatId}`);
  });
})();
